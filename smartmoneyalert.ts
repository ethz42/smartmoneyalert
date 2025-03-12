import { QueryParameter, DuneClient } from "@duneanalytics/client-sdk";
import type { RunQueryArgs } from "@duneanalytics/client-sdk";
import { Scraper } from 'agent-twitter-client';
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

// 加载环境变量
dotenv.config();

// 初始化Dune客户端
const dune = new DuneClient(process.env.DUNE_API_KEY || "JlbyLiMGtYW45JZPRrOoAziFYdpvhCLf");

// 初始化Twitter客户端
const scraper = new Scraper({
    transform: {
        request: (input, init) => {
            // 添加自定义请求头
            const customHeaders = {
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
                'Accept-Language': 'en-US,en;q=0.9',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
                'sec-ch-ua': '"Chromium";v="122", "Google Chrome";v="122", "Not(A:Brand";v="24"',
                'sec-ch-ua-mobile': '?0',
                'sec-ch-ua-platform': '"macOS"'
            };
            
            // 合并现有头和自定义头
            const mergedInit = {
                ...init,
                headers: {
                    ...(init?.headers || {}),
                    ...customHeaders
                }
            };
            
            return [input, mergedInit];
        },
    },
});

// 初始化Supabase客户端
const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_ANON_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);

// 获取交易记录
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
        console.error('Error get records', error);
        throw new Error('Error get records');
    }
}

// 获取聪明钱地址
const getSmartMoneyAddresses = async () => {
    try {
        // 从smart_money表获取地址
        const { data: smartMoneyData, error } = await supabase
            .from('smart_money')
            .select('address');
            
        if (error) {
            throw new Error(`获取smart_money数据失败: ${error.message}`);
        }
        
        const stringArray: string[] = [];
        let t = 0;
        
        // 获取地址，最多5个
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
        console.error('Error get smart money addresses', error);
        throw new Error('Error get smart money addresses');
    }
}

// 使用AI分析交易记录
const analyzeTradeRecords = async (tradeRecords: string) => {
    const aiQuery = `evaluate this trader within 110 words: ${tradeRecords}`;
    console.log("开始分析交易记录...");
    
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
        console.error('AI分析失败:', err);
        throw new Error('AI分析失败');
    }
}

// 检查并确保Twitter登录
const ensureTwitterLogin = async () => {
    try {
        const isLoggedIn = await scraper.isLoggedIn();
        if (!isLoggedIn) {
            console.log('正在登录Twitter...');
            // 随机延迟1-3秒，模拟人类行为
            const randomDelay = 1000 + Math.floor(Math.random() * 2000);
            await new Promise(resolve => setTimeout(resolve, randomDelay));
            
            await scraper.login(
                process.env.TWITTER_USERNAME || '',
                process.env.TWITTER_PASSWORD || '',
                process.env.TWITTER_EMAIL,
                undefined,
                process.env.TWITTER_API_KEY,
                process.env.TWITTER_API_SECRET_KEY,
                process.env.TWITTER_ACCESS_TOKEN,
                process.env.TWITTER_ACCESS_TOKEN_SECRET
            );
            console.log('Twitter登录成功');
        } else {
            console.log('已登录Twitter');
        }
        return true;
    } catch (error) {
        console.error('Twitter登录失败:', error);
        return false;
    }
}

// 发送推文
const sendTweet = async (content: string, address: string) => {
    const maxRetries = 3;
    let retryCount = 0;
    
    while (retryCount < maxRetries) {
        try {
            console.log(`准备发送关于地址 ${address} 的分析推文...尝试 ${retryCount + 1}/${maxRetries}`);
            
            // 确保已登录
            const loginSuccess = await ensureTwitterLogin();
            if (!loginSuccess) {
                retryCount++;
                continue;
            }
            
            // 随机延迟1-2秒
            await new Promise(resolve => setTimeout(resolve, 1000 + Math.floor(Math.random() * 1000)));
            
            // 构建推文内容
            const tweetContent = `🔍 聪明钱地址分析 ${address.substring(0, 6)}...${address.substring(address.length - 4)}\n\n${content}\n\n#加密货币 #交易分析 #聪明钱`;
            
            // 发送推文
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
                } 
            };
            const tweetId = responseData?.data?.create_tweet?.tweet_results?.result?.rest_id;
            
            if (tweetId) {
                console.log(`推文发送成功！推文ID: ${tweetId}`);
                return tweetId;
            }
            
            console.error('发送推文失败，无法获取推文ID');
            retryCount++;
            
            // 如果失败但还有重试次数，等待更长时间
            if (retryCount < maxRetries) {
                const waitTime = 5000 * retryCount; // 递增等待时间
                console.log(`等待 ${waitTime/1000} 秒后重试...`);
                await new Promise(resolve => setTimeout(resolve, waitTime));
            }
        } catch (error) {
            console.error('发送推文时出错:', error);
            retryCount++;
            
            // 如果失败但还有重试次数，等待更长时间
            if (retryCount < maxRetries) {
                const waitTime = 5000 * retryCount; // 递增等待时间
                console.log(`等待 ${waitTime/1000} 秒后重试...`);
                await new Promise(resolve => setTimeout(resolve, waitTime));
            }
        }
    }
    
    console.error(`发送推文失败，已达到最大重试次数 ${maxRetries}`);
    return null;
}

// 将处理过的地址记录到Supabase
const recordProcessedAddress = async (address: string) => {
    try {
        const today = new Date().toISOString().split('T')[0];
        await supabase
            .from('processed_addresses')
            .insert([
                { address, processed_date: today }
            ]);
        console.log(`地址 ${address} 已记录为已处理`);
    } catch (error) {
        console.error('记录处理地址失败:', error);
    }
}

// 主函数
async function main() {
    try {
        // 提前登录Twitter
        await ensureTwitterLogin();
        
        console.log("开始获取聪明钱地址...");
        const smartMoneyAddresses = await getSmartMoneyAddresses();
        
        if (smartMoneyAddresses.length === 0) {
            console.log("今天没有新的聪明钱地址需要处理");
            return;
        }
        
        console.log(`获取到 ${smartMoneyAddresses.length} 个未处理的聪明钱地址`);
        
        for (const address of smartMoneyAddresses) {
            try {
                console.log(`正在处理地址: ${address}`);
                
                // 获取交易记录
                console.log("获取交易记录...");
                const tradeRecords = await getTradeRecords(address);
                
                if (!tradeRecords || tradeRecords.trim() === '') {
                    console.log(`地址 ${address} 没有有效的交易记录，跳过`);
                    await recordProcessedAddress(address);
                    continue;
                }
                
                // 分析交易记录
                const analysis = await analyzeTradeRecords(tradeRecords);
                console.log("分析结果:", analysis);
                
                // 发送推文
                const tweetId = await sendTweet(analysis, address);
                
                if (tweetId) {
                    // 记录已处理的地址
                    await recordProcessedAddress(address);
                }
                
                // 等待一段时间，避免API限制
                await new Promise(resolve => setTimeout(resolve, 5000));
                
            } catch (error) {
                console.error(`处理地址 ${address} 时出错:`, error);
            }
        }
        
        console.log("所有地址处理完成");
        
    } catch (error) {
        console.error("程序执行出错:", error);
    }
}

// 运行主函数
main();