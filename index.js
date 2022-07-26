const moment = require('moment');
const date = require("./date")

/**
 * This is the main entrypoint to your Probot app
 * @param {import('probot').Probot} app
 */
module.exports = (app) => {
    // Your code here
    app.log.info("Yay, the app was loaded!");

    app.on("issues.opened", async (context) => {

        let isWeeklyReport;
        await context.payload.issue.labels.forEach((label) => {
            isWeeklyReport = label.name === "weekly-report"
        })

        if (!isWeeklyReport) {
            return;
        }


        const {owner, repo} = context.repo()
        console.log("owner : " + owner + " repo : " + repo)

        // 查询上一周的 issue 记录信息
        const lastWeekIssues = await listIssue(context, {
            owner: owner,
            repo: repo,
            state: 'all',
            since: moment(date.tailDate(14)).format("YYYY-MM-DDTHH:MM:SSZ"),
            per_page: 100,
        })

        // 查询一周之内的 issue 记录信息
        const curWeekIssues = await listIssue(context, {
            owner: owner,
            repo: repo,
            state: 'all',
            since: moment(date.tailDate()).format("YYYY-MM-DDTHH:MM:SSZ"),
            per_page: 100,
        })

        // 查询打上了 bug 标签并且仍然处于 open 状态的 issue
        const totalBugIssues = await listIssue(context, {
            owner: owner,
            repo: repo,
            state: 'open',
            per_page: 100,
        })

        const comment = buildIssueComment(curWeekIssues, lastWeekIssues, totalBugIssues)

        const newComment = context.issue({ body: comment });
        context.octokit.issues.createComment(newComment)
    });

    // For more information on building apps:
    // https://probot.github.io/docs/

    // To get your app running against GitHub, see:
    // https://probot.github.io/docs/development/
};

async function listIssue(ctx, params) {
    const issues = await ctx.octokit.paginate(
        ctx.octokit.issues.listForRepo,
        params,
        (res, done) => {
            return res.data
        },
    );

    return issues
}

function buildIssueComment(issues, lastWeekIssues, totalBugIssues) {

    let body = `
# Weekly-Report (${moment().format("YYYY-MM-DD")})
    `
    let openBugIssueStr = '\n## New Bug (新增的 bug)\n';
    let closeBugIssueStr = '\n## Close Bug (关闭的 bug)\n';

    let openIssueStr =  "\n## New Issue (新增的 issue)\n";
    let closeIssueStr = "\n## Close Issue (关闭的 issue)\n";


    // 计算当前仍然处于打开的 bug issue 数量
    const openBugIssue = issues.filter((item) => item.state === 'open').filter((item) => {
        let isBug = false
        item.labels.forEach((l) => {
            if (isBug) {
                return
            }
            isBug = l.name === "bug"
        })

        return isBug
    });
    if (openBugIssue.length > 0) {
        openBugIssue.forEach((item) => {
            openBugIssueStr += `- :bug: [#${item.number}](${item.html_url}) ${item.title.replace(/\n/g, ' ')}\n`;
        });
    }

    // 记录本周关闭的 bug issue 数量
    const closeBugIssue = issues.filter((item) => item.state === 'closed').filter((item) => {
        let isBug = false
        item.labels.forEach((l) => {
            if (isBug) {
                return
            }
            isBug = l.name === "bug"
        })

        return isBug
    });
    if (closeBugIssue.length > 0) {
        closeBugIssue.forEach((item) => {
            closeBugIssueStr += `- :yum: [#${item.number}](${item.html_url}) ${item.title.replace(/\n/g, ' ')}\n`;
        });
    }


    // 记录本周关闭的 issue 数量
    const closeIssue = issues.filter((item) => item.state === 'closed').filter((item) => {
        let isWeekly = false
        item.labels.forEach((l) => {
            if (isWeekly) {
                return
            }
            isWeekly = l.name === "weekly-report"
        })

        return !isWeekly
    });
    if (closeIssue.length > 0) {
        closeIssue.forEach((item) => {
            closeIssueStr += `- :yum: [#${item.number}](${item.html_url}) ${item.title.replace(/\n/g, ' ')}\n`;
        });
    }

    // 记录本周新增的 issue 数量
    const openIssue = issues.filter((item) => item.state === 'open').filter((item) => {
        let isWeekly = false
        item.labels.forEach((l) => {
            if (isWeekly) {
                return
            }
            isWeekly = l.name === "weekly-report"
        })

        return !isWeekly
    });
    if (openIssue.length > 0) {
        openIssue.forEach((item) => {
            openIssueStr += `- :bug: [#${item.number}](${item.html_url}) ${item.title.replace(/\n/g, ' ')}\n`;
        });
    }

    let issueCategory = `
\n
## Issue 情况

### issue 变化

| 本周新增 Issue 数量 | 本周关闭 Issue 数量 |
| :--: | :--: |
| ${openIssue.length} | ${closeIssue.length} |
\n

### issue 类别

| Issue 标签 | 本周新增数量 |
| :-- | :--: |`

    const expectLabel = new Map();
    expectLabel.set("bug", "缺陷")
    expectLabel.set("enhancement", "优化 or 特性")
    expectLabel.set("documentation", "文档")
    expectLabel.set("code quality", "代码质量")
    expectLabel.set("need discuss", "待讨论")

    const labelCategory = new Map();
    labelCategory.set("bug", 0)
    labelCategory.set("enhancement", 0)
    labelCategory.set("documentation", 0)
    labelCategory.set("code quality", 0)
    labelCategory.set("need discuss", 0)

    openIssue.forEach((issue) => {
        issue.labels.forEach((label) => {
            if (expectLabel.has(label)) {
                let v = labelCategory.get(label)
                labelCategory.set(label, v + 1)
            }
        })
    })

    labelCategory.forEach((value, key) => {
        issueCategory += `\n| **${key} (${expectLabel.get(key)})** | ${value} |`
    })

    let issueBugInfo = `
\n
## Bug 情况

| 未关闭的 Bug 数量 | 本周新增 Bug 数量 | 本周关闭 Bug 数量 |
| :--: | :--: | :--: |
| ${totalBugIssues.length} | ${openBugIssue.length} | ${closeBugIssue.length} |
\n
    `

    body += issueCategory
    body += issueBugInfo
    body += openBugIssueStr
    body += closeBugIssueStr
    body += closeIssueStr

    return body
}

