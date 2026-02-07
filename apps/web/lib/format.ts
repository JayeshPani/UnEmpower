/**
 * Formatting utilities for UnEmpower frontend
 */

const USDC_DECIMALS = 6;

/**
 * Parse a USDC string value to bigint (6 decimals)
 * @param value - String value like "100.50"
 * @returns BigInt in smallest unit (100500000n for "100.50")
 */
export function parseUSDC(value: string): bigint {
    if (!value || value === '') return 0n;

    // Remove any commas
    const cleaned = value.replace(/,/g, '');

    // Split on decimal point
    const [whole, decimal = ''] = cleaned.split('.');

    // Pad or truncate decimal to 6 places
    const paddedDecimal = decimal.padEnd(USDC_DECIMALS, '0').slice(0, USDC_DECIMALS);

    // Combine and parse
    const combined = whole + paddedDecimal;
    return BigInt(combined);
}

/**
 * Format bigint USDC amount to string (6 decimals)
 * @param amount - BigInt amount in smallest unit
 * @returns Formatted string like "100.50"
 */
export function formatUSDC(amount: bigint | string | number): string {
    const bigAmount = typeof amount === 'bigint' ? amount : BigInt(amount.toString());

    if (bigAmount === 0n) return '0.00';

    const str = bigAmount.toString().padStart(USDC_DECIMALS + 1, '0');
    const whole = str.slice(0, -USDC_DECIMALS) || '0';
    const decimal = str.slice(-USDC_DECIMALS);

    // Remove trailing zeros but keep at least 2 decimal places
    const trimmedDecimal = decimal.replace(/0+$/, '').padEnd(2, '0');

    // Add thousand separators
    const formattedWhole = parseInt(whole).toLocaleString('en-US');

    return `${formattedWhole}.${trimmedDecimal}`;
}

/**
 * Format basis points to percentage string
 * @param aprBps - APR in basis points (e.g., 1200 = 12%)
 * @returns Formatted string like "12.00%"
 */
export function formatBps(aprBps: number): string {
    const percentage = aprBps / 100;
    return `${percentage.toFixed(2)}%`;
}

/**
 * Format countdown timer from expiration timestamp
 * @param expiresAt - Unix timestamp in seconds
 * @returns Formatted string like "14:32" or "Expired"
 */
export function formatCountdown(expiresAt: number): string {
    const now = Math.floor(Date.now() / 1000);
    const remaining = expiresAt - now;

    if (remaining <= 0) return 'Expired';

    const minutes = Math.floor(remaining / 60);
    const seconds = remaining % 60;

    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

/**
 * Check if attestation is expired
 * @param expiresAt - Unix timestamp in seconds
 * @returns true if expired
 */
export function isExpired(expiresAt: number): boolean {
    return Math.floor(Date.now() / 1000) >= expiresAt;
}

/**
 * Format address to shortened form
 * @param address - Full address
 * @returns Shortened like "0x1234...5678"
 */
export function shortenAddress(address: string): string {
    if (!address || address.length < 10) return address;
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

/**
 * Format timestamp to human readable date
 * @param timestamp - Unix timestamp in seconds
 * @returns Formatted date string
 */
export function formatDate(timestamp: number): string {
    return new Date(timestamp * 1000).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
    });
}

/**
 * Format timestamp to relative time
 * @param timestamp - Unix timestamp in seconds
 * @returns Relative time like "2 hours ago"
 */
export function formatRelativeTime(timestamp: number): string {
    const now = Math.floor(Date.now() / 1000);
    const diff = now - timestamp;

    if (diff < 60) return 'Just now';
    if (diff < 3600) return `${Math.floor(diff / 60)} min ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)} hours ago`;
    return `${Math.floor(diff / 86400)} days ago`;
}
