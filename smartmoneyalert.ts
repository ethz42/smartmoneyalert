import { QueryParameter, DuneClient } from "@duneanalytics/client-sdk";
import type { RunQueryArgs } from "@duneanalytics/client-sdk";
import { Scraper } from 'agent-twitter-client';
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import nodeFetch from 'node-fetch';
import { SocksProxyAgent } from 'socks-proxy-agent';

// Load environment variables
dotenv.config();

// SOCKS proxy settings
const useSocksProxy = true; // Set to true to enable SOCKS proxy
const proxyUrlRaw = process.env.PROXY_URL || '127.0.0.1:7890'; // Raw proxy address
const socksProxyUrl = proxyUrlRaw.includes('://') ? proxyUrlRaw : `socks5://${proxyUrlRaw}`; // Ensure protocol prefix

if (useSocksProxy) {
  console.log(`Using SOCKS proxy: ${socksProxyUrl} with extended options`);
  // Create SOCKS proxy using URL string
  const socksAgent = new SocksProxyAgent(socksProxyUrl);
  
  // Use fetch with proxy
  // @ts-ignore
  global.fetch = (url, options = {}) => {
    // Add more options to handle TLS issues
    const fetchOptions = {
      ...options,
      agent: socksAgent,
      timeout: 60000, // 60 seconds timeout
    };
    
    // Add retry logic
    return new Promise((resolve, reject) => {
      const attemptFetch = (retries: number) => {
        // @ts-ignore
        nodeFetch(url, fetchOptions)
          .then((response: any) => resolve(response))
          .catch((error: Error) => {
            if (retries > 0 && (
                error.message.includes('ECONNRESET') || 
                error.message.includes('ERR_TLS_CERT_ALTNAME_INVALID') || 
                error.message.includes('socket disconnected') || 
                error.message.includes('TLS')
            )) {
              console.log(`Fetch attempt failed, retrying... (${retries} attempts left)`);
              setTimeout(() => attemptFetch(retries - 1), 2000);
            } else {
              reject(error);
            }
          });
      };
      
      attemptFetch(3); // Maximum 3 retries
    });
  };
} else {
  // No proxy
  // @ts-ignore
  global.fetch = nodeFetch;
}

// Make Headers, Request, Response globally available
// @ts-ignore
global.Headers = nodeFetch.Headers;
// @ts-ignore
global.Request = nodeFetch.Request;
// @ts-ignore
global.Response = nodeFetch.Response;

// Initialize Dune client
const dune = new DuneClient(process.env.DUNE_API_KEY || "JlbyLiMGtYW45JZPRrOoAziFYdpvhCLf");

// Initialize Twitter client
const scraper = new Scraper()

// Initialize Supabase client
const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_ANON_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);

// Get trade records
const getTradeRecords = async (address: string) => {
    try {
        const queryId = 4831125;
        const opts: RunQueryArgs = {
            queryId,
            query_parameters: [
              QueryParameter.text("trader_id", address),
            ],
          };
        const query_result = await dune.runQuery(opts);
        
        let tradeRecords = '';
        let num = 0;
        
        if (query_result.result?.rows) {
            for (const row of query_result.result.rows) {
                num++;
                const rowData = row as Record<string, unknown>;
                const time = String(rowData.block_time).substring(0, 16);
                const token_buy = String(rowData.token_bought_symbol);
                const buy_amount = Number(rowData.token_bought_amount);
                const token_sell = String(rowData.token_sold_symbol);
                const sell_amount = Number(rowData.token_sold_amount);
                const amount_usd = Number(rowData.amount_usd);

                const isBuyTokenValid = (token_buy === 'SOL' || token_buy === 'USDT');
                const isSellTokenValid = (token_sell === 'SOL' || token_sell === 'USDT');

                if (isBuyTokenValid && !isSellTokenValid) {
                    const price = amount_usd / sell_amount;
                    tradeRecords += `time: ${time} sell ${token_sell} price ${price} amount ${sell_amount} `;
                } else if (isSellTokenValid && !isBuyTokenValid) {
                    const price = amount_usd / buy_amount;
                    tradeRecords += `time: ${time} buy ${token_buy} price ${price} amount ${buy_amount} `;
                }
            }
        }
        
        return tradeRecords;
    } catch (error) {
        console.error('Error getting trade records:', error);
        throw new Error('Error getting trade records');
    }
}

// Get smart money addresses
const getSmartMoneyAddresses = async () => {
    try {
        // Get addresses from smart_money table
        const { data: smartMoneyData, error } = await supabase
            .from('smart_money')
            .select('address');
            
        if (error) {
            throw new Error(`Failed to get smart_money data: ${error.message}`);
        }
        
        const stringArray: string[] = [];
        let t = 0;
        
        // Get up to 5 addresses
        if (smartMoneyData) {
            for (const row of smartMoneyData) {
                if (t < 5) {
                    stringArray.push(row.address);
                    t += 1;
                }
            }
        }
        
        return stringArray;
    } catch (error) {
        console.error('Error getting smart money addresses:', error);
        throw new Error('Error getting smart money addresses');
    }
}

// Analyze trade records with AI
const analyzeTradeRecords = async (tradeRecords: string) => {
    const aiQuery = `evaluate this trader within 110 words: ${tradeRecords}`;
    console.log("Starting trade record analysis...");
    
    const options = {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${process.env.AI_API_KEY || 'sk-iljyliaypbwjcdjdgfvmzikbfvqfnsrbpbbtervaeuqtiqvm'}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            model: "deepseek-ai/DeepSeek-V3",
            messages: [{ role: "user", content: aiQuery }],
            stream: false,
            max_tokens: 500,
            temperature: 0.2,
            top_p: 0.5,
            top_k: 50,
            frequency_penalty: 0.5,
            n: 1,
            response_format: { type: "text" },
        })
    };
    
    try {
        const response = await fetch('https://api.siliconflow.cn/v1/chat/completions', options);
        const data = await response.json() as { 
            choices: Array<{ message: { content: string } }> 
        };
        return data.choices[0].message.content;
    } catch (err) {
        console.error('AI analysis failed:', err);
        throw new Error('AI analysis failed');
    }
}

// Check and ensure Twitter login
const ensureTwitterLogin = async () => {
    const maxLoginRetries = 3;
    let loginRetryCount = 0;
    
    while (loginRetryCount < maxLoginRetries) {
        try {
            console.log(`Attempting to check Twitter login status... Attempt ${loginRetryCount + 1}/${maxLoginRetries}`);
            
            // First check if already logged in
            let isLoggedIn = false;
            try {
                isLoggedIn = await scraper.isLoggedIn();
            } catch (checkError) {
                console.error('Error checking login status:', checkError);
                // If check fails, assume not logged in
                isLoggedIn = false;
            }
            
            if (!isLoggedIn) {
                console.log('Logging into Twitter...');
                // Random delay 2-5 seconds to simulate human behavior
                const randomDelay = 2000 + Math.floor(Math.random() * 3000);
                console.log(`Waiting ${randomDelay/1000} seconds before login attempt...`);
                await new Promise(resolve => setTimeout(resolve, randomDelay));
                
                try {
                    await scraper.login(
                        process.env.TWITTER_USERNAME || '',
                        process.env.TWITTER_PASSWORD || '',
                        process.env.TWITTER_EMAIL,
                        process.env.TWITTER_API_KEY,
                        process.env.TWITTER_API_SECRET_KEY,
                        process.env.TWITTER_ACCESS_TOKEN,
                        process.env.TWITTER_ACCESS_TOKEN_SECRET
                    );
                    console.log('Twitter login successful');
                    return true;
                } catch (loginError) {
                    console.error('Twitter login failed:', loginError);
                    loginRetryCount++;
                    
                    if (loginRetryCount < maxLoginRetries) {
                        const waitTime = 10000 * loginRetryCount;
                        console.log(`Waiting ${waitTime/1000} seconds before retry...`);
                        await new Promise(resolve => setTimeout(resolve, waitTime));
                    }
                    continue;
                }
            } else {
                console.log('Already logged into Twitter');
                return true;
            }
        } catch (error) {
            console.error('Error during Twitter login process:', error);
            loginRetryCount++;
            
            if (loginRetryCount < maxLoginRetries) {
                const waitTime = 10000 * loginRetryCount;
                console.log(`Waiting ${waitTime/1000} seconds before retry...`);
                await new Promise(resolve => setTimeout(resolve, waitTime));
            }
        }
    }
    
    console.error(`Twitter login failed, reached maximum retry attempts ${maxLoginRetries}`);
    return false;
}

// Send tweet
const sendTweet = async (content: string, address: string) => {
    const maxRetries = 5; // Increase maximum retry attempts
    let retryCount = 0;
    
    while (retryCount < maxRetries) {
        try {
            console.log(`Preparing to send analysis tweet for address ${address}...Attempt ${retryCount + 1}/${maxRetries}`);
            
            // Ensure logged in
            const loginSuccess = await ensureTwitterLogin();
            if (!loginSuccess) {
                console.log("Twitter login failed, waiting 5 seconds before retry...");
                await new Promise(resolve => setTimeout(resolve, 5000));
                retryCount++;
                continue;
            }
            
            // Random delay 2-5 seconds
            const randomDelay = 2000 + Math.floor(Math.random() * 3000);
            console.log(`Waiting ${randomDelay/1000} seconds before sending tweet...`);
            await new Promise(resolve => setTimeout(resolve, randomDelay));
            
            // Build tweet content, ensure under 280 characters
            const addressShort = `${address.substring(0, 6)}...${address.substring(address.length - 4)}`;
            const hashtags = "#Crypto #Trading";
            
            // Calculate length of fixed parts (short address, title, line breaks and hashtags)
            const fixedContentLength = `🔍 Smart Money Analysis ${addressShort}\n\n`.length + `\n\n${hashtags}`.length;
            
            // Calculate maximum content length to ensure total is under 280
            const maxContentLength = 280 - fixedContentLength;
            
            // If content too long, truncate
            let trimmedContent = content;
            if (content.length > maxContentLength) {
                trimmedContent = content.substring(0, maxContentLength - 3) + "...";
                console.log(`Content truncated to ${trimmedContent.length} characters`);
            }
            
            // Final tweet content
            const tweetContent = `🔍 Smart Money Analysis ${addressShort}\n\n${trimmedContent}\n\n${hashtags}`;
            console.log(`Tweet length: ${tweetContent.length} characters`);
            
            console.log("Sending tweet...");
            // Send tweet
            try {
                const response = await scraper.sendTweet(tweetContent);
                const responseData = await response.json() as { 
                    data?: { 
                        create_tweet?: { 
                            tweet_results?: { 
                                result?: { 
                                    rest_id?: string 
                                } 
                            } 
                        } 
                    },
                    errors?: Array<{
                        message: string,
                        code: number
                    }>
                };
                
                // Check for errors
                if (responseData.errors && responseData.errors.length > 0) {
                    console.error('Twitter API returned errors:', JSON.stringify(responseData.errors));
                    
                    // If character limit error, try shortening content further
                    if (responseData.errors.some(e => e.code === 186)) {
                        console.log('Tweet content too long, attempting to shorten further...');
                        trimmedContent = content.substring(0, Math.floor(maxContentLength * 0.8)) + "...";
                        const shorterTweetContent = `🔍 Smart Money ${addressShort}\n\n${trimmedContent}\n\n#Crypto`;
                        console.log(`Shortened tweet length: ${shorterTweetContent.length} characters`);
                        
                        // Wait a bit before retry
                        await new Promise(resolve => setTimeout(resolve, 3000));
                        const retryResponse = await scraper.sendTweet(shorterTweetContent);
                        const retryData = await retryResponse.json() as typeof responseData;
                        
                        if (retryData.data?.create_tweet?.tweet_results?.result?.rest_id) {
                            console.log(`Tweet sent successfully! Tweet ID: ${retryData.data.create_tweet.tweet_results.result.rest_id}`);
                            return retryData.data.create_tweet.tweet_results.result.rest_id;
                        }
                    }
                    
                    // Other errors, continue retrying
                    retryCount++;
                    continue;
                }
                
                const tweetId = responseData?.data?.create_tweet?.tweet_results?.result?.rest_id;
                
                if (tweetId) {
                    console.log(`Tweet sent successfully! Tweet ID: ${tweetId}`);
                    return tweetId;
                }
                
                console.error('Failed to send tweet, unable to get tweet ID, response data:', JSON.stringify(responseData));
            } catch (tweetError) {
                console.error('Error sending tweet:', tweetError);
                // Special handling for TLS/SSL errors
                if (tweetError instanceof Error && 
                    (tweetError.message.includes('TLS') || 
                     tweetError.message.includes('socket') || 
                     tweetError.message.includes('certificate'))) {
                    console.log("Detected TLS/SSL connection issue, possibly unstable proxy connection");
                }
            }
            
            retryCount++;
            
            // If failed but still have retries, wait longer
            if (retryCount < maxRetries) {
                const waitTime = 10000 * retryCount; // Increasing wait time, starting from 10 seconds
                console.log(`Waiting ${waitTime/1000} seconds before retry...`);
                await new Promise(resolve => setTimeout(resolve, waitTime));
            }
        } catch (error) {
            console.error('Error in tweet sending process:', error);
            retryCount++;
            
            // If failed but still have retries, wait longer
            if (retryCount < maxRetries) {
                const waitTime = 10000 * retryCount; // Increasing wait time
                console.log(`Waiting ${waitTime/1000} seconds before retry...`);
                await new Promise(resolve => setTimeout(resolve, waitTime));
            }
        }
    }
    
    console.error(`Failed to send tweet, reached maximum retry attempts ${maxRetries}`);
    return null;
}

// Record processed address in Supabase
const recordProcessedAddress = async (address: string) => {
    try {
        const today = new Date().toISOString().split('T')[0];
        await supabase
            .from('processed_addresses')
            .insert([
                { address, processed_date: today }
            ]);
        console.log(`Address ${address} has been recorded as processed`);
    } catch (error) {
        console.error('Failed to record processed address:', error);
    }
}

// Main function
async function main() {
    try {
        // Login to Twitter in advance
        await ensureTwitterLogin();
        
        console.log("Starting to get smart money addresses...");
        const smartMoneyAddresses = await getSmartMoneyAddresses();
        
        if (smartMoneyAddresses.length === 0) {
            console.log("No new smart money addresses to process today");
            return;
        }
        
        console.log(`Retrieved ${smartMoneyAddresses.length} unprocessed smart money addresses`);
        
        // Process only one address per day
        const address = smartMoneyAddresses[0];
        try {
            console.log(`Processing address: ${address}`);
            
            // Get trade records
            console.log("Getting trade records...");
            const tradeRecords = await getTradeRecords(address);
            
            if (!tradeRecords || tradeRecords.trim() === '') {
                console.log(`Address ${address} has no valid trade records, skipping`);
                await recordProcessedAddress(address);
                return;
            }
            
            // Analyze trade records
            const analysis = await analyzeTradeRecords(tradeRecords);
            console.log("Analysis result:", analysis);
            
            // Send tweet
            const tweetId = await sendTweet(analysis, address);
            
            if (tweetId) {
                // Record processed address
                await recordProcessedAddress(address);
            }
            
        } catch (error) {
            console.error(`Error processing address ${address}:`, error);
        }
        
        console.log("Daily smart money analysis completed");
        
    } catch (error) {
        console.error("Program execution error:", error);
    }
}

// Run main function
main();