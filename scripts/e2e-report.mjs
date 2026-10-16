export function finishReport(report) {
  report.finishedAt = new Date().toISOString();
  report.passed = report.checks.filter((item) => item.ok).length;
  report.failed = report.checks.filter((item) => !item.ok).length;
  report.outcome =
    report.failed || report.exceptions.length
      ? 'failed'
      : report.blockers.length || !report.checks.length
        ? 'blocked'
        : 'passed';
  return report;
}

export async function runWithReport({ report, execute, close, save }) {
  try {
    await execute();
  } catch (error) {
    report.exceptions.push({ phase: 'execute', message: error.message });
  } finally {
    try {
      await close();
    } catch (error) {
      report.exceptions.push({ phase: 'close', message: error.message });
    }
    await save(finishReport(report));
  }
}
