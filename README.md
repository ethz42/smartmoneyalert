# Smart Money Alert

An automated tool that:
1. Retrieves "smart money" addresses from a Supabase database
2. Fetches transaction records for these addresses using the Dune Analytics API
3. Analyzes transaction records using AI
4. Automatically publishes the analysis results to Twitter

## Features

- Automatic retrieval of smart money addresses
- Transaction record analysis
- AI-generated analysis reports
- Automatic Twitter posting
- Tracking of processed addresses

## Environment Variables

The following environment variables need to be set in a `.env` file:

```
# Dune Analytics API Key
DUNE_API_KEY=your_dune_api_key

# Supabase Configuration
SUPABASE_URL=your_supabase_url
SUPABASE_ANON_KEY=your_supabase_anon_key

# Twitter API Configuration
TWITTER_USERNAME=your_twitter_username
TWITTER_PASSWORD=your_twitter_password
TWITTER_EMAIL=your_twitter_email
TWITTER_API_KEY=your_twitter_api_key
TWITTER_API_SECRET_KEY=your_twitter_api_secret_key
TWITTER_ACCESS_TOKEN=your_twitter_access_token
TWITTER_ACCESS_TOKEN_SECRET=your_twitter_access_token_secret

# AI API Key
AI_API_KEY=your_ai_api_key
```

## Usage

1. Install dependencies: `npm install`
2. Configure environment variables
3. Run the program: `npm start` 