"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const dotenv = __importStar(require("dotenv"));
const infojobs_1 = require("./platforms/infojobs");
const computrabajo_1 = require("./platforms/computrabajo");
const bumeran_1 = require("./platforms/bumeran");
// Load environment variables
dotenv.config();
function parseList(envVal) {
    if (!envVal)
        return [];
    return envVal.split(',').map(item => item.trim()).filter(item => item.length > 0);
}
function sleep(ms) {
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
        await (0, infojobs_1.runInfoJobs)(keywords, locations, dryRun);
    }
    catch (error) {
        console.error('[Orchestrator] Error running InfoJobs process:', error.message || error);
    }
    // 2. Run CompuTrabajo
    try {
        await (0, computrabajo_1.runCompuTrabajo)(keywords, locations, dryRun);
    }
    catch (error) {
        console.error('[Orchestrator] Error running CompuTrabajo process:', error.message || error);
    }
    // 3. Run Bumeran
    try {
        await (0, bumeran_1.runBumeran)(keywords, locations, dryRun);
    }
    catch (error) {
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
            }
            catch (err) {
                console.error('[Daemon] Error in loop cycle:', err.message || err);
            }
            console.log(`[Daemon] Sleeping for ${intervalHours} hours before next cycle...`);
            await sleep(intervalMs);
        }
    }
    else {
        console.log('[Daemon] running in SINGLE RUN MODE.');
        await runAutomationCycle();
    }
}
main().catch(err => {
    console.error('[Daemon] Fatal Orchestrator Error:', err);
    process.exit(1);
});
