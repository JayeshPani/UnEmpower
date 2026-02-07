/** @type {import('next').NextConfig} */
const nextConfig = {
    reactStrictMode: true,
    env: {
        NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000',
        NEXT_PUBLIC_CHAIN_ID: process.env.NEXT_PUBLIC_CHAIN_ID || '11155111',
    },
    webpack: (config, { isServer }) => {
        // Stub optional peer deps from MetaMask SDK / WalletConnect (browser-only)
        config.resolve.fallback = {
            ...config.resolve.fallback,
            '@react-native-async-storage/async-storage': false,
            'pino-pretty': false,
        };
        config.externals = config.externals || [];
        if (!isServer) {
            config.externals.push('pino-pretty', 'encoding');
        }
        return config;
    },
}

module.exports = nextConfig
