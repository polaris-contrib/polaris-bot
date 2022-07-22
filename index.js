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

        // 查询一周之前的 issue 记录信息
        const tailDateObject = moment(date.tailDate()).format("YYYY-MM-DDTHH:MM:SSZ");
        const queryWeeklyIssue = {
            owner: owner,
            repo: repo,
            state: 'all',
            since: tailDateObject,
            per_page: 100,
        }
        const issues = await listIssue(context, queryWeeklyIssue)

        // 查询打上了 bug 标签并且仍然处于 open 状态的 issue
        const queryAllBugIssue = {
            owner: owner,
            repo: repo,
            state: 'open',
            per_page: 100,
        }
        const totalBugIssues = await listIssue(context, queryAllBugIssue)

        const comment = buildIssueComment(issues, totalBugIssues)

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

function buildIssueComment(issues, totalBugIssues) {

    let body = `
# Weekly-Report (${moment().format("YYYY-MM-DD")})
    `
    let openBugIssueStr = '\n## New Bug (新增的 bug)\n';
    let closeBugIssueStr = '\n## Close Bug (已关闭的 bug)\n';

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

    let table = `
\n
## Issue 情况

| 未关闭的 Bug 数量 | 本周新增 Bug 数量 | 本周关闭 Bug 数量 |
| :--: | :--: | :--: |
| ${totalBugIssues.length} | ${openBugIssue.length} | ${closeBugIssue.length} |
\n
    `

    body += table
    body += openBugIssueStr
    body += closeBugIssueStr

    return body
}

