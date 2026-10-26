#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import { aggregateStartupOutcomes } from './p0-journey-driver.mjs';

const STARTUP_OUTCOMES = new Set(['PASS', 'PASS_WITH_STARTUP_RECOVERY', 'BLOCKED']);
const PRODUCT_VERDICTS = new Set(['PASS', 'FAIL', 'NOT_EXECUTED']);

function finish(summary, exitCode) {
  process.stdout.write(`${JSON.stringify(summary)}\n`);
  process.exitCode = exitCode;
}

function invalid(reports) {
  finish({ outcome: 'BLOCKED', code: 'REPORT_INVALID', reports }, 2);
}

async function main(paths = process.argv.slice(2)) {
  if (paths.length === 0) {
    invalid(0);
    return;
  }

  const startupOutcomes = [];
  for (const [index, reportPath] of paths.entries()) {
    let report;
    try {
      report = JSON.parse(await readFile(reportPath, 'utf8'));
    } catch {
      invalid(index);
      return;
    }

    const reports = index + 1;
    if (
      !report ||
      typeof report !== 'object' ||
      Array.isArray(report) ||
      !STARTUP_OUTCOMES.has(report.startupOutcome) ||
      !PRODUCT_VERDICTS.has(report.productVerdict)
    ) {
      invalid(reports);
      return;
    }
    if (report.productVerdict === 'FAIL') {
      finish({ outcome: 'FAIL', productVerdict: 'FAIL', reports }, 1);
      return;
    }
    if (report.startupOutcome === 'BLOCKED') {
      const aggregate = aggregateStartupOutcomes([...startupOutcomes, 'BLOCKED']);
      finish({ ...aggregate, reports }, 2);
      return;
    }
    if (report.productVerdict !== 'PASS') {
      invalid(reports);
      return;
    }

    startupOutcomes.push(report.startupOutcome);
    const aggregate = aggregateStartupOutcomes(startupOutcomes);
    if (aggregate.outcome === 'BLOCKED_ENVIRONMENT_UNSTABLE') {
      finish({ ...aggregate, reports }, 2);
      return;
    }
  }

  finish({ ...aggregateStartupOutcomes(startupOutcomes), reports: paths.length }, 0);
}

await main();
