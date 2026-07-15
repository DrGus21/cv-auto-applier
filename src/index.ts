import * as dotenv from 'dotenv';
import { runInfoJobs } from './platforms/infojobs';
import { runCompuTrabajo } from './platforms/computrabajo';
import { runBumeran } from './platforms/bumeran';

// Load environment variables
dotenv.config();

function parseList(envVal: string | undefined): string[] {
  if (!envVal) return [];
  return envVal.split(',').map(item => item.trim()).filter(item => item.length > 0);
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function runAutomationCycle() {
  console.log('\n======================================================');
  console.log(`[Orchestrator] Starting Automation Cycle: ${new Date().toISOString()}`);
  console.log('======================================================');

  const dryRun = process.env.DRY_RUN !== 'false'; // Default to true for safety
  const keywords = parseList(process.env.JOB_KEYWORDS);
  const locations = parseList(process.env.JOB_LOCATIONS);

  console.log(`[Orchestrator] Mode: ${dryRun ? 'DRY RUN (No real applications will be submitted)' : 'PRODUCTION (Real applications will be submitted)'}`);
  console.log(`[Orchestrator] Keywords: ${JSON.stringify(keywords)}`);
  console.log(`[Orchestrator] Locations: ${JSON.stringify(locations)}`);

  if (keywords.length === 0) {
    console.error('[Orchestrator] Error: No keywords found in JOB_KEYWORDS. Update your .env file.');
    return;
  }

  // 1. Run InfoJobs
  try {
    await runInfoJobs(keywords, locations, dryRun);
  } catch (error: any) {
    console.error('[Orchestrator] Error running InfoJobs process:', error.message || error);
  }

  // 2. Run CompuTrabajo
  try {
    await runCompuTrabajo(keywords, locations, dryRun);
  } catch (error: any) {
    console.error('[Orchestrator] Error running CompuTrabajo process:', error.message || error);
  }

  // 3. Run Bumeran
  try {
    await runBumeran(keywords, locations, dryRun);
  } catch (error: any) {
    console.error('[Orchestrator] Error running Bumeran process:', error.message || error);
  }

  console.log('\n======================================================');
  console.log(`[Orchestrator] Finished Automation Cycle: ${new Date().toISOString()}`);
  console.log('======================================================\n');
}

async function main() {
  const intervalHours = parseFloat(process.env.RUN_INTERVAL_HOURS || '12');
  const continuousMode = !isNaN(intervalHours) && intervalHours > 0;

  if (continuousMode) {
    console.log(`[Daemon] running in CONTINUOUS DAEMON MODE. Cycle interval: every ${intervalHours} hours.`);
    const intervalMs = intervalHours * 60 * 60 * 1000;
    
    while (true) {
      try {
        await runAutomationCycle();
      } catch (err: any) {
        console.error('[Daemon] Error in loop cycle:', err.message || err);
      }
      
      console.log(`[Daemon] Sleeping for ${intervalHours} hours before next cycle...`);
      await sleep(intervalMs);
    }
  } else {
    console.log('[Daemon] running in SINGLE RUN MODE.');
    await runAutomationCycle();
  }
}

main().catch(err => {
  console.error('[Daemon] Fatal Orchestrator Error:', err);
  process.exit(1);
});
