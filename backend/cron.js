const cron = require("node-cron");
const { checkOverdueBalances } = require("./jobs/checkOverdueBalances");

/**
 * Run daily at 07:00 AM
 */
cron.schedule("0 7 * * *", async () => {
  console.log("⏰ Running overdue balance check...");
  await checkOverdueBalances();
});
