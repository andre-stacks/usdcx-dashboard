'use client';

import React, { useState, useEffect } from 'react';
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  ComposedChart,
  Line,
} from 'recharts';

// USDCx Contract Info
const CONTRACT_ADDRESS = 'SP120SBRBQJ00MCWS7TM5R8WJNTTKD5K0HFRC2CNE';
const CONTRACT_NAME = 'usdcx';
const FULL_CONTRACT = `${CONTRACT_ADDRESS}.${CONTRACT_NAME}`;
const HIRO_API = 'https://api.hiro.so';
const USDCX_API = 'https://api.usdc-on-stacks.com';

// API Helper Functions
const fetchWithRetry = async (url, retries = 3) => {
  // Get API key from environment
  const apiKey = process.env.NEXT_PUBLIC_HIRO_API_KEY;

  const headers = {};

  // Add API key header if available
  if (apiKey) {
    headers['x-hiro-api-key'] = apiKey;
  }

  for (let i = 0; i < retries; i++) {
    try {
      console.log(`Fetching: ${url} (attempt ${i + 1})`);
      const response = await fetch(url, {
        method: 'GET',
        headers,
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`HTTP ${response.status}: ${errorText}`);
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();
      console.log(`Success: ${url}`, data);
      return data;
    } catch (error) {
      console.error(`Attempt ${i + 1} failed for ${url}:`, error.message);
      if (i === retries - 1) throw error;
      await new Promise((r) => setTimeout(r, 1000 * (i + 1)));
    }
  }
};

// Fetch token metadata and supply from Hiro
const fetchTokenInfo = async () => {
  const url = `${HIRO_API}/metadata/v1/ft/${FULL_CONTRACT}`;
  return fetchWithRetry(url);
};

// Fetch USDCx metrics from official API (returns Prometheus format)
const fetchUSDCxMetrics = async () => {
  const url = `${USDCX_API}/metrics`;
  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const text = await response.text();
    return parsePrometheusMetrics(text);
  } catch (error) {
    console.error('Failed to fetch USDCx metrics:', error);
    throw error;
  }
};

// Parse Prometheus format metrics into structured data
const parsePrometheusMetrics = (text) => {
  const metrics = {
    mainnet: {},
    testnet: {},
  };

  const lines = text.split('\n');

  for (const line of lines) {
    // Skip comments and empty lines
    if (line.startsWith('#') || !line.trim()) continue;

    // Parse metric line: metric_name{labels} value
    const match = line.match(/^(\w+)\{([^}]*)\}\s+([\d.]+)$/);
    if (!match) continue;

    const [, metricName, labelsStr, value] = match;

    // Parse labels
    const labels = {};
    labelsStr.split(',').forEach((pair) => {
      const [key, val] = pair.split('=');
      if (key && val) {
        labels[key.trim()] = val.replace(/"/g, '').trim();
      }
    });

    const network = labels.network || 'mainnet';
    const numValue = parseFloat(value);

    // Store metric based on type
    if (metricName === 'usdcx_total_supply_stacks') {
      metrics[network].totalSupply = numValue;
    } else if (metricName === 'usdcx_total_deposited_eth') {
      metrics[network].totalDepositedEth = numValue;
    } else if (metricName === 'usdcx_total_actions') {
      if (!metrics[network].bridgeActions) {
        metrics[network].bridgeActions = { in: 0, out: 0 };
      }
      if (labels.bridge_dir === 'in') {
        metrics[network].bridgeActions.in = numValue;
      } else if (labels.bridge_dir === 'out') {
        metrics[network].bridgeActions.out = numValue;
      }
    } else if (metricName === 'usdcx_unique_holders') {
      metrics[network].uniqueHolders = numValue;
    } else if (metricName === 'usdcx_unique_bridge_wallets') {
      if (!metrics[network].uniqueBridgeWallets) {
        metrics[network].uniqueBridgeWallets = { in: 0, out: 0 };
      }
      if (labels.bridge_dir === 'in') {
        metrics[network].uniqueBridgeWallets.in = numValue;
      } else if (labels.bridge_dir === 'out') {
        metrics[network].uniqueBridgeWallets.out = numValue;
      }
    } else if (metricName === 'usdcx_relayer_stx_balance') {
      metrics[network].relayerBalance = numValue;
    } else if (metricName === 'usdcx_is_paused') {
      metrics[network].isPaused = numValue === 1;
    }
  }

  return metrics;
};

// Fetch token holders - max 50 per request
const fetchHolders = async (limit = 50, offset = 0) => {
  const url = `${HIRO_API}/extended/v1/tokens/ft/${FULL_CONTRACT}/holders?limit=${Math.min(limit, 50)}&offset=${offset}`;
  return fetchWithRetry(url);
};

// Fetch multiple pages of holders
const fetchAllHolders = async (totalLimit = 200) => {
  const pageSize = 50;
  const pages = Math.ceil(totalLimit / pageSize);
  const allResults = [];

  for (let i = 0; i < pages; i++) {
    try {
      const result = await fetchHolders(pageSize, i * pageSize);
      if (result?.results) {
        allResults.push(...result.results);
      }
      // Stop if we got fewer results than requested (no more data)
      if (!result?.results || result.results.length < pageSize) {
        break;
      }
    } catch (error) {
      console.error(`Failed to fetch holders page ${i + 1}:`, error);
      break;
    }
  }

  return { results: allResults };
};

// Fetch contract transactions (transfers, mints, burns) - max 50 per request
const fetchTransactions = async (limit = 50, offset = 0) => {
  const url = `${HIRO_API}/extended/v1/address/${FULL_CONTRACT}/transactions?limit=${Math.min(limit, 50)}&offset=${offset}`;
  return fetchWithRetry(url);
};

// Fetch multiple pages of transactions
const fetchAllTransactions = async (totalLimit = 200) => {
  const pageSize = 50;
  const pages = Math.ceil(totalLimit / pageSize);
  const allResults = [];

  for (let i = 0; i < pages; i++) {
    try {
      const result = await fetchTransactions(pageSize, i * pageSize);
      if (result?.results) {
        allResults.push(...result.results);
      }
      // Stop if we got fewer results than requested (no more data)
      if (!result?.results || result.results.length < pageSize) {
        break;
      }
    } catch (error) {
      console.error(`Failed to fetch page ${i + 1}:`, error);
      break;
    }
  }

  return { results: allResults };
};

// Fetch FT transfer events
const fetchFTEvents = async (limit = 50) => {
  const url = `${HIRO_API}/extended/v1/address/${FULL_CONTRACT}/assets?limit=${limit}`;
  return fetchWithRetry(url);
};

// Process transactions into daily aggregates
const processTransactionsToDaily = (transactions) => {
  if (!transactions || !Array.isArray(transactions)) {
    console.warn('No transactions to process');
    return [];
  }

  const dailyMap = new Map();

  transactions.forEach((tx) => {
    if (tx.tx_status !== 'success') return;

    // Handle both burn_block_time and block_time
    const timestamp = tx.burn_block_time || tx.block_time;
    if (!timestamp) return;

    const date = new Date(timestamp * 1000).toISOString().split('T')[0];
    const existing = dailyMap.get(date) || {
      date,
      transactions: 0,
      volume: 0,
      minted: 0,
      burned: 0,
    };

    existing.transactions += 1;

    // Check for mint/burn events in contract calls
    if (tx.tx_type === 'contract_call') {
      const functionName = tx.contract_call?.function_name || '';
      if (functionName.includes('mint')) {
        const args = tx.contract_call?.function_args || [];
        const amountArg = args.find((a) => a.name === 'amount');
        if (amountArg) {
          existing.minted += parseInt(amountArg.repr?.replace('u', '') || 0);
        }
      } else if (functionName.includes('burn')) {
        const args = tx.contract_call?.function_args || [];
        const amountArg = args.find((a) => a.name === 'amount');
        if (amountArg) {
          existing.burned += parseInt(amountArg.repr?.replace('u', '') || 0);
        }
      }
    }

    dailyMap.set(date, existing);
  });

  return Array.from(dailyMap.values())
    .sort((a, b) => new Date(a.date) - new Date(b.date))
    .map((d) => ({
      ...d,
      displayDate: new Date(d.date).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
      }),
      netFlow: d.minted - d.burned,
    }));
};

// Format utilities
const formatNumber = (num) => {
  if (num === null || num === undefined || isNaN(num)) return '-';
  if (num >= 1000000) return (num / 1000000).toFixed(2) + 'M';
  if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
  return num.toLocaleString();
};

const formatCurrency = (num) => {
  if (num === null || num === undefined || isNaN(num)) return '-';
  return '$' + formatNumber(num);
};

// Components
const CustomTooltip = ({ active, payload, label, formatter }) => {
  if (active && payload && payload.length) {
    return (
      <div
        style={{
          background: 'rgba(17, 17, 27, 0.95)',
          border: '1px solid #5546ff',
          borderRadius: '8px',
          padding: '12px 16px',
          boxShadow: '0 4px 20px rgba(85, 70, 255, 0.3)',
        }}
      >
        <p style={{ color: '#a0a0b0', marginBottom: '8px', fontSize: '12px' }}>
          {label}
        </p>
        {payload.map((entry, index) => (
          <p
            key={index}
            style={{ color: entry.color, margin: '4px 0', fontWeight: '600' }}
          >
            {entry.name}:{' '}
            {formatter ? formatter(entry.value) : formatNumber(entry.value)}
          </p>
        ))}
      </div>
    );
  }
  return null;
};

const StatCard = ({ title, value, change, changeLabel, icon, loading }) => (
  <div
    style={{
      background:
        'linear-gradient(135deg, rgba(85, 70, 255, 0.1) 0%, rgba(255, 95, 31, 0.05) 100%)',
      border: '1px solid rgba(85, 70, 255, 0.3)',
      borderRadius: '16px',
      padding: '24px',
      flex: '1',
      minWidth: '200px',
    }}
  >
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        marginBottom: '12px',
      }}
    >
      <span style={{ fontSize: '20px' }}>{icon}</span>
      <span
        style={{
          color: '#a0a0b0',
          fontSize: '14px',
          textTransform: 'uppercase',
          letterSpacing: '1px',
        }}
      >
        {title}
      </span>
    </div>
    <div
      style={{
        fontSize: '32px',
        fontWeight: '700',
        color: '#fff',
        marginBottom: '8px',
      }}
    >
      {loading ? <span style={{ opacity: 0.5 }}>Loading...</span> : value}
    </div>
    {change && !loading && (
      <div
        style={{
          color: parseFloat(change) >= 0 ? '#00d9a5' : '#ff5f5f',
          fontSize: '14px',
          fontWeight: '500',
        }}
      >
        {parseFloat(change) >= 0 ? '↑' : '↓'} {Math.abs(parseFloat(change))}%{' '}
        {changeLabel}
      </div>
    )}
  </div>
);

const ChartCard = ({ title, children, loading, noData }) => (
  <div
    style={{
      background: 'rgba(17, 17, 27, 0.6)',
      border: '1px solid rgba(85, 70, 255, 0.2)',
      borderRadius: '16px',
      padding: '24px',
      marginBottom: '24px',
      position: 'relative',
    }}
  >
    <h3
      style={{
        color: '#fff',
        fontSize: '18px',
        fontWeight: '600',
        marginBottom: '20px',
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
      }}
    >
      {title}
    </h3>
    {loading ? (
      <div
        style={{
          height: 300,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#a0a0b0',
        }}
      >
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '24px', marginBottom: '8px' }}>⏳</div>
          Loading chart data...
        </div>
      </div>
    ) : noData ? (
      <div
        style={{
          height: 300,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#a0a0b0',
        }}
      >
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '24px', marginBottom: '8px' }}>📊</div>
          No data available yet
        </div>
      </div>
    ) : (
      children
    )}
  </div>
);

const LoadingOverlay = () => (
  <div
    style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      background: 'rgba(10, 10, 18, 0.9)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1000,
    }}
  >
    <div style={{ textAlign: 'center', color: '#fff' }}>
      <div style={{ fontSize: '48px', marginBottom: '16px' }}>🔄</div>
      <h2 style={{ marginBottom: '8px' }}>Fetching USDCx Data</h2>
      <p style={{ color: '#a0a0b0' }}>Connecting to Hiro API...</p>
    </div>
  </div>
);

export default function USDCxDashboard() {
  const [timeRange, setTimeRange] = useState('All');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [debugInfo, setDebugInfo] = useState('');

  // Data state
  const [tokenInfo, setTokenInfo] = useState(null);
  const [holders, setHolders] = useState([]);
  const [dailyData, setDailyData] = useState([]);
  const [totalSupply, setTotalSupply] = useState(null);
  const [usdcxMetrics, setUsdcxMetrics] = useState(null);

  // Fetch all data on mount
  useEffect(() => {
    const fetchAllData = async () => {
      setLoading(true);
      setError(null);
      setDebugInfo('Starting data fetch...');

      try {
        // Check if API key is set
        const apiKey = process.env.NEXT_PUBLIC_HIRO_API_KEY;
        setDebugInfo((prev) => prev + `\nAPI Key present: ${!!apiKey}`);

        // Fetch in parallel with individual error handling
        const results = await Promise.allSettled([
          fetchTokenInfo(),
          fetchAllHolders(200),
          fetchAllTransactions(200),
          fetchUSDCxMetrics(),
        ]);

        const [tokenInfoResult, holdersResult, txResult, metricsResult] = results;

        // Process USDCx official metrics (highest priority for accurate data)
        if (metricsResult.status === 'fulfilled' && metricsResult.value) {
          const metrics = metricsResult.value;
          setUsdcxMetrics(metrics.mainnet);
          setDebugInfo((prev) => prev + `\nUSDCx metrics loaded: supply=${metrics.mainnet?.totalSupply}, holders=${metrics.mainnet?.uniqueHolders}`);

          // Use official supply if available
          if (metrics.mainnet?.totalSupply) {
            setTotalSupply(metrics.mainnet.totalSupply);
          }
        } else {
          setDebugInfo(
            (prev) =>
              prev +
              `\nUSDCx metrics failed: ${metricsResult.reason?.message || 'Unknown error'}`
          );
        }

        // Process token info
        if (tokenInfoResult.status === 'fulfilled' && tokenInfoResult.value) {
          const info = tokenInfoResult.value;
          setTokenInfo(info);
          setDebugInfo((prev) => prev + `\nToken info loaded: ${info.name}`);

          const decimals = info.decimals || 6;
          const supply = info.total_supply
            ? parseInt(info.total_supply) / Math.pow(10, decimals)
            : null;
          setTotalSupply(supply);
        } else {
          setDebugInfo(
            (prev) =>
              prev +
              `\nToken info failed: ${tokenInfoResult.reason?.message || 'Unknown error'}`
          );
        }

        // Process holders
        if (holdersResult.status === 'fulfilled' && holdersResult.value?.results) {
          setHolders(holdersResult.value.results);
          setDebugInfo(
            (prev) =>
              prev + `\nHolders loaded: ${holdersResult.value.results.length}`
          );
        } else if (
          holdersResult.status === 'fulfilled' &&
          Array.isArray(holdersResult.value)
        ) {
          setHolders(holdersResult.value);
          setDebugInfo(
            (prev) => prev + `\nHolders loaded: ${holdersResult.value.length}`
          );
        } else {
          setDebugInfo(
            (prev) =>
              prev +
              `\nHolders failed: ${holdersResult.reason?.message || 'Unknown error'}`
          );
        }

        // Process transactions
        if (txResult.status === 'fulfilled' && txResult.value?.results) {
          const processed = processTransactionsToDaily(txResult.value.results);
          setDailyData(processed);
          setDebugInfo(
            (prev) =>
              prev +
              `\nTransactions loaded: ${txResult.value.results.length}, daily: ${processed.length}`
          );
        } else {
          setDebugInfo(
            (prev) =>
              prev +
              `\nTransactions failed: ${txResult.reason?.message || 'Unknown error'}`
          );
        }

        // Check if all failed
        const allFailed = results.every((r) => r.status === 'rejected');
        if (allFailed) {
          setError('Unable to connect to Hiro API. Please check console for details.');
        }
      } catch (err) {
        console.error('Error fetching data:', err);
        setError(err.message);
        setDebugInfo((prev) => prev + `\nFatal error: ${err.message}`);
      } finally {
        setLoading(false);
      }
    };

    fetchAllData();

    // Refresh every 5 minutes
    const interval = setInterval(fetchAllData, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  // Filter data by time range
  const getFilteredData = (data) => {
    if (!data || data.length === 0) return [];
    if (timeRange === 'All') return data;

    const now = new Date();
    const days = timeRange === '7d' ? 7 : 30;
    const cutoff = new Date(now.setDate(now.getDate() - days));

    return data.filter((d) => new Date(d.date) >= cutoff);
  };

  const filteredDaily = getFilteredData(dailyData);

  // Calculate stats - prefer official metrics when available
  const totalHolders = usdcxMetrics?.uniqueHolders || holders.length;
  const totalTxCount = dailyData.reduce((sum, d) => sum + d.transactions, 0);
  const totalMinted = dailyData.reduce((sum, d) => sum + d.minted, 0);
  const totalBurned = dailyData.reduce((sum, d) => sum + d.burned, 0);

  // Bridge stats from official API
  const bridgeIn = usdcxMetrics?.bridgeActions?.in || 0;
  const bridgeOut = usdcxMetrics?.bridgeActions?.out || 0;
  const totalDepositedEth = usdcxMetrics?.totalDepositedEth || 0;
  const isPaused = usdcxMetrics?.isPaused || false;

  // Build holders over time (cumulative approximation)
  const holdersOverTime =
    filteredDaily.length > 0
      ? filteredDaily.map((d, i) => ({
          ...d,
          uniqueHolders: Math.min(
            totalHolders,
            Math.floor(((i + 1) / filteredDaily.length) * totalHolders) + 1
          ),
        }))
      : [];

  const handleRefresh = () => {
    window.location.reload();
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        background:
          'linear-gradient(180deg, #0a0a12 0%, #12121f 50%, #0a0a12 100%)',
        color: '#fff',
        fontFamily:
          '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        padding: '32px',
      }}
    >
      {loading && <LoadingOverlay />}

      {/* Header */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '32px',
          flexWrap: 'wrap',
          gap: '16px',
        }}
      >
        <div>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              marginBottom: '8px',
            }}
          >
            <div
              style={{
                width: '48px',
                height: '48px',
                borderRadius: '50%',
                background: 'linear-gradient(135deg, #5546ff 0%, #ff5f1f 100%)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: '700',
                fontSize: '18px',
              }}
            >
              $
            </div>
            <div>
              <h1 style={{ fontSize: '28px', fontWeight: '700', margin: 0 }}>
                {tokenInfo?.name || 'USDCx'} Dashboard
              </h1>
              <p
                style={{
                  color: '#a0a0b0',
                  margin: '4px 0 0 0',
                  fontSize: '14px',
                }}
              >
                Stacks Network • {tokenInfo?.symbol || 'USDCx'} • Live Data
              </p>
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <button
            onClick={handleRefresh}
            style={{
              padding: '8px 12px',
              borderRadius: '8px',
              border: '1px solid rgba(255,255,255,0.1)',
              background: 'transparent',
              color: '#a0a0b0',
              cursor: 'pointer',
              fontSize: '14px',
            }}
          >
            🔄 Refresh
          </button>
          {['7d', '30d', 'All'].map((range) => (
            <button
              key={range}
              onClick={() => setTimeRange(range)}
              style={{
                padding: '8px 16px',
                borderRadius: '8px',
                border:
                  timeRange === range
                    ? '1px solid #5546ff'
                    : '1px solid rgba(255,255,255,0.1)',
                background:
                  timeRange === range ? 'rgba(85, 70, 255, 0.2)' : 'transparent',
                color: timeRange === range ? '#fff' : '#a0a0b0',
                cursor: 'pointer',
                fontWeight: '500',
                transition: 'all 0.2s',
              }}
            >
              {range}
            </button>
          ))}
        </div>
      </div>

      {/* Error Banner */}
      {error && (
        <div
          style={{
            background: 'rgba(255, 95, 95, 0.1)',
            border: '1px solid rgba(255, 95, 95, 0.3)',
            borderRadius: '12px',
            padding: '16px 20px',
            marginBottom: '24px',
            color: '#ff5f5f',
          }}
        >
          ⚠️ {error}
          <details style={{ marginTop: '8px', fontSize: '12px', color: '#a0a0b0' }}>
            <summary style={{ cursor: 'pointer' }}>Debug info</summary>
            <pre style={{ whiteSpace: 'pre-wrap', marginTop: '8px' }}>
              {debugInfo}
            </pre>
          </details>
        </div>
      )}

      {/* Contract Info */}
      <div
        style={{
          background: 'rgba(85, 70, 255, 0.1)',
          border: '1px solid rgba(85, 70, 255, 0.3)',
          borderRadius: '12px',
          padding: '16px 20px',
          marginBottom: '24px',
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          flexWrap: 'wrap',
        }}
      >
        <span style={{ color: '#a0a0b0', fontSize: '14px' }}>Contract:</span>
        <code
          style={{
            color: '#5546ff',
            background: 'rgba(85, 70, 255, 0.15)',
            padding: '6px 12px',
            borderRadius: '6px',
            fontSize: '13px',
            wordBreak: 'break-all',
          }}
        >
          {FULL_CONTRACT}
        </code>
        <span
          style={{
            color: loading ? '#ffaa00' : error ? '#ff5f5f' : '#00d9a5',
            fontSize: '12px',
            padding: '4px 8px',
            background: loading
              ? 'rgba(255,170,0,0.1)'
              : error
                ? 'rgba(255,95,95,0.1)'
                : 'rgba(0,217,165,0.1)',
            borderRadius: '4px',
          }}
        >
          {loading ? '● Syncing...' : error ? '● Error' : '● Live'}
        </span>
        <a
          href={`https://explorer.hiro.so/token/${FULL_CONTRACT}?chain=mainnet`}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            color: '#ff5f1f',
            textDecoration: 'none',
            fontSize: '14px',
            marginLeft: 'auto',
          }}
        >
          View on Explorer →
        </a>
      </div>

      {/* Stats Row */}
      <div
        style={{
          display: 'flex',
          gap: '20px',
          marginBottom: '32px',
          flexWrap: 'wrap',
        }}
      >
        <StatCard
          title="Total Supply"
          value={totalSupply ? formatCurrency(totalSupply) : '-'}
          icon="💰"
          loading={loading}
        />
        <StatCard
          title="Token Holders"
          value={totalHolders > 0 ? formatNumber(totalHolders) : '-'}
          icon="👥"
          loading={loading}
        />
        <StatCard
          title="Total Transactions"
          value={totalTxCount > 0 ? formatNumber(totalTxCount) : '-'}
          icon="📊"
          loading={loading}
        />
        <StatCard
          title="Net Minted"
          value={
            totalMinted > 0 || totalBurned > 0
              ? formatNumber(totalMinted - totalBurned)
              : '-'
          }
          icon="🔥"
          loading={loading}
        />
      </div>

      {/* Charts Grid */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(450px, 1fr))',
          gap: '24px',
        }}
      >
        {/* Holders Chart */}
        <ChartCard
          title="👥 Holders Over Time"
          loading={loading}
          noData={holdersOverTime.length === 0}
        >
          <ResponsiveContainer width="100%" height={300}>
            <ComposedChart data={holdersOverTime}>
              <defs>
                <linearGradient
                  id="holdersGradient"
                  x1="0"
                  y1="0"
                  x2="0"
                  y2="1"
                >
                  <stop offset="5%" stopColor="#00d9a5" stopOpacity={0.4} />
                  <stop offset="95%" stopColor="#00d9a5" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid
                strokeDasharray="3 3"
                stroke="rgba(255,255,255,0.1)"
              />
              <XAxis
                dataKey="displayDate"
                stroke="#a0a0b0"
                tick={{ fontSize: 12 }}
                interval="preserveStartEnd"
              />
              <YAxis stroke="#a0a0b0" tick={{ fontSize: 12 }} />
              <Tooltip content={<CustomTooltip />} />
              <Legend />
              <Area
                type="monotone"
                dataKey="uniqueHolders"
                stroke="#00d9a5"
                strokeWidth={2}
                fill="url(#holdersGradient)"
                name="Total Holders"
              />
            </ComposedChart>
          </ResponsiveContainer>
        </ChartCard>

        {/* Transaction Volume Chart */}
        <ChartCard
          title="📊 Daily Transactions"
          loading={loading}
          noData={filteredDaily.length === 0}
        >
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={filteredDaily}>
              <defs>
                <linearGradient id="txGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#ff5f1f" stopOpacity={0.8} />
                  <stop offset="95%" stopColor="#ff5f1f" stopOpacity={0.2} />
                </linearGradient>
              </defs>
              <CartesianGrid
                strokeDasharray="3 3"
                stroke="rgba(255,255,255,0.1)"
              />
              <XAxis
                dataKey="displayDate"
                stroke="#a0a0b0"
                tick={{ fontSize: 12 }}
                interval="preserveStartEnd"
              />
              <YAxis stroke="#a0a0b0" tick={{ fontSize: 12 }} />
              <Tooltip content={<CustomTooltip />} />
              <Bar
                dataKey="transactions"
                fill="url(#txGradient)"
                name="Transactions"
                radius={[4, 4, 0, 0]}
              />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        {/* Mint/Burn Chart */}
        <ChartCard
          title="🔥 Mint/Burn Flow"
          loading={loading}
          noData={filteredDaily.length === 0}
        >
          <ResponsiveContainer width="100%" height={300}>
            <ComposedChart data={filteredDaily}>
              <CartesianGrid
                strokeDasharray="3 3"
                stroke="rgba(255,255,255,0.1)"
              />
              <XAxis
                dataKey="displayDate"
                stroke="#a0a0b0"
                tick={{ fontSize: 12 }}
                interval="preserveStartEnd"
              />
              <YAxis
                stroke="#a0a0b0"
                tick={{ fontSize: 12 }}
                tickFormatter={formatNumber}
              />
              <Tooltip content={<CustomTooltip formatter={formatNumber} />} />
              <Legend />
              <Bar dataKey="minted" fill="#00d9a5" name="Minted" />
              <Bar dataKey="burned" fill="#ff5f5f" name="Burned" />
              <Line
                type="monotone"
                dataKey="netFlow"
                stroke="#5546ff"
                strokeWidth={3}
                dot={false}
                name="Net Flow"
              />
            </ComposedChart>
          </ResponsiveContainer>
        </ChartCard>

        {/* Top Holders Table */}
        <ChartCard
          title="🏆 Top Holders"
          loading={loading}
          noData={holders.length === 0}
        >
          <div style={{ maxHeight: 300, overflowY: 'auto' }}>
            <table
              style={{
                width: '100%',
                borderCollapse: 'collapse',
                fontSize: '14px',
              }}
            >
              <thead>
                <tr
                  style={{ borderBottom: '1px solid rgba(255,255,255,0.1)' }}
                >
                  <th
                    style={{
                      textAlign: 'left',
                      padding: '8px',
                      color: '#a0a0b0',
                    }}
                  >
                    #
                  </th>
                  <th
                    style={{
                      textAlign: 'left',
                      padding: '8px',
                      color: '#a0a0b0',
                    }}
                  >
                    Address
                  </th>
                  <th
                    style={{
                      textAlign: 'right',
                      padding: '8px',
                      color: '#a0a0b0',
                    }}
                  >
                    Balance
                  </th>
                  <th
                    style={{
                      textAlign: 'right',
                      padding: '8px',
                      color: '#a0a0b0',
                    }}
                  >
                    %
                  </th>
                </tr>
              </thead>
              <tbody>
                {holders.slice(0, 10).map((holder, i) => {
                  const balance = parseInt(holder.balance || 0) / 1e6;
                  const percentage = totalSupply
                    ? ((balance / totalSupply) * 100).toFixed(2)
                    : '-';
                  return (
                    <tr
                      key={holder.address || i}
                      style={{
                        borderBottom: '1px solid rgba(255,255,255,0.05)',
                      }}
                    >
                      <td style={{ padding: '8px', color: '#a0a0b0' }}>
                        {i + 1}
                      </td>
                      <td style={{ padding: '8px' }}>
                        <a
                          href={`https://explorer.hiro.so/address/${holder.address}?chain=mainnet`}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{ color: '#5546ff', textDecoration: 'none' }}
                        >
                          {holder.address
                            ? `${holder.address.slice(0, 8)}...${holder.address.slice(-6)}`
                            : '-'}
                        </a>
                      </td>
                      <td style={{ padding: '8px', textAlign: 'right' }}>
                        {formatCurrency(balance)}
                      </td>
                      <td
                        style={{
                          padding: '8px',
                          textAlign: 'right',
                          color: '#a0a0b0',
                        }}
                      >
                        {percentage}%
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </ChartCard>
      </div>

      {/* Footer */}
      <div
        style={{
          marginTop: '40px',
          padding: '20px',
          textAlign: 'center',
          color: '#a0a0b0',
          fontSize: '13px',
          borderTop: '1px solid rgba(255,255,255,0.1)',
        }}
      >
        <p>USDCx Token Analytics Dashboard • Live data from Hiro API</p>
        <p style={{ marginTop: '8px' }}>
          Built for Stacks Network •
          <a
            href={`https://explorer.hiro.so/token/${FULL_CONTRACT}?chain=mainnet`}
            style={{
              color: '#5546ff',
              textDecoration: 'none',
              marginLeft: '4px',
            }}
            target="_blank"
            rel="noopener noreferrer"
          >
            View Contract on Hiro Explorer
          </a>
        </p>
      </div>
    </div>
  );
}
