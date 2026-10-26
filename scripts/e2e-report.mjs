export function finishReport(report) {
  report.finishedAt = new Date().toISOString();
  report.passed = report.checks.filter((item) => item.ok).length;
  report.failed = report.checks.filter((item) => !item.ok).length;
  const productExecuted = report.checks.length > 0;
  report.productVerdict =
    report.failed || report.exceptions.length ? 'FAIL' : productExecuted ? 'PASS' : 'NOT_EXECUTED';
  if (report.productVerdict === 'FAIL') {
    report.outcome = 'failed';
  } else if (report.startupOutcome === 'BLOCKED' || report.blockers.length || !productExecuted) {
    report.outcome = 'blocked';
  } else if (report.startupOutcome === 'PASS_WITH_STARTUP_RECOVERY') {
    report.outcome = 'passed_with_startup_recovery';
  } else {
    report.outcome = 'passed';
  }
  return report;
}

export async function runWithReport({
  report,
  execute,
  close,
  save,
  serializeError = (phase, error) => ({ phase, message: error.message }),
}) {
  try {
    await execute();
  } catch (error) {
    report.exceptions.push(serializeError('execute', error));
  } finally {
    try {
      await close();
    } catch (error) {
      report.exceptions.push(serializeError('close', error));
    }
    await save(finishReport(report));
  }
}
