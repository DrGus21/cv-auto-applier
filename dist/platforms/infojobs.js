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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.runInfoJobs = runInfoJobs;
const axios_1 = __importDefault(require("axios"));
const dotenv = __importStar(require("dotenv"));
dotenv.config();
async function runInfoJobs(keywords, locations, dryRun) {
    const clientId = process.env.INFOJOBS_CLIENT_ID;
    const clientSecret = process.env.INFOJOBS_CLIENT_SECRET;
    const oauthToken = process.env.INFOJOBS_OAUTH_TOKEN;
    // Check if credentials are placeholders or missing
    const isConfigured = clientId && clientId !== 'your_client_id' &&
        clientSecret && clientSecret !== 'your_client_secret' &&
        oauthToken && oauthToken !== 'your_oauth_token';
    if (!isConfigured) {
        console.log('\n[InfoJobs] Skipping platform: Credentials are not configured in .env (INFOJOBS_CLIENT_ID, INFOJOBS_CLIENT_SECRET, INFOJOBS_OAUTH_TOKEN).');
        return;
    }
    console.log('\n[InfoJobs] Starting job search and auto-apply process...');
    const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
    const headers = {
        'Authorization': `Basic ${basicAuth}`,
        'Content-Type': 'application/json',
    };
    const userHeaders = {
        'Authorization': `Bearer ${oauthToken}`,
        'Content-Type': 'application/json',
    };
    for (const keyword of keywords) {
        try {
            console.log(`[InfoJobs] Searching offers for keyword: "${keyword}"...`);
            // Call search endpoint
            const response = await axios_1.default.get('https://api.infojobs.net/api/1/offer', {
                headers,
                params: {
                    q: keyword,
                    maxResults: 10,
                    order: 'relevance'
                }
            });
            const offers = response.data.offers || [];
            console.log(`[InfoJobs] Found ${offers.length} offers for "${keyword}".`);
            for (const offer of offers) {
                // Filter by location if specified
                const locationMatch = locations.length === 0 || locations.some(loc => offer.province.value.toLowerCase().includes(loc.toLowerCase()));
                if (!locationMatch) {
                    console.log(`[InfoJobs] [Skipped] Offer "${offer.title}" at "${offer.company.name}" in "${offer.province.value}" does not match target locations.`);
                    continue;
                }
                console.log(`[InfoJobs] Processing Offer: "${offer.title}" by "${offer.company.name}" (${offer.province.value})`);
                // 1. Check if already applied
                try {
                    const checkAppResponse = await axios_1.default.get(`https://api.infojobs.net/api/1/application`, {
                        headers: userHeaders,
                        params: { offerId: offer.id }
                    });
                    if (checkAppResponse.data && checkAppResponse.data.length > 0) {
                        console.log(`[InfoJobs] [Already Applied] You have already applied to offer "${offer.title}".`);
                        continue;
                    }
                }
                catch (e) {
                    // If 404 or empty list, it means not applied
                    // Log only if it is a severe error, else proceed
                }
                if (dryRun) {
                    console.log(`[InfoJobs] [DRY RUN] Would apply to offer "${offer.title}" at ${offer.link}`);
                }
                else {
                    console.log(`[InfoJobs] [APPLYING] Sending application to offer "${offer.title}"...`);
                    try {
                        // Apply endpoint: POST /api/1/application
                        // Typically requires setting CV id, cover letter etc.
                        // Let's call the postulation endpoint:
                        const applyResponse = await axios_1.default.post(`https://api.infojobs.net/api/1/application`, {
                            offerId: offer.id,
                            // InfoJobs requires selecting the user's registered CV and cover letter on their system
                            // Usually we can omit it if they have a default, or read it first
                        }, {
                            headers: userHeaders
                        });
                        console.log(`[InfoJobs] [SUCCESS] Successfully applied to "${offer.title}". Application ID: ${applyResponse.data.id || 'N/A'}`);
                    }
                    catch (applyError) {
                        console.error(`[InfoJobs] [FAILED] Failed to apply to "${offer.title}": ${applyError.response?.data?.error_description || applyError.message}`);
                    }
                }
            }
        }
        catch (error) {
            console.error(`[InfoJobs] Error searching offers for "${keyword}": ${error.response?.data?.error_description || error.message}`);
        }
    }
}
