# backtest/backtest.py
# Minimal reproducible backtest harness.
# Requires: pandas, numpy

import pandas as pd
import numpy as np
import json
from datetime import datetime
from typing import Dict, Any

def load_fixture(path: str) -> pd.DataFrame:
    """
    Expect CSV with columns:
      timestamp, event_id, market_odds, model_prob, stake, result (1=win,0=loss)
    """
    df = pd.read_csv(path, parse_dates=['timestamp'])
    return df.sort_values('timestamp').reset_index(drop=True)

def run_backtest(df: pd.DataFrame) -> pd.DataFrame:
    """
    Replays decisions in df, computes per-trade pnl and metadata, returns enriched dataframe.
    """
    df = df.copy()
    # compute implied_edge: model_prob - 1/odds
    df['implied_prob'] = 1.0 / df['market_odds']
    df['edge'] = df['model_prob'] - df['implied_prob']
    df['payout'] = df['stake'] * (df['market_odds'] - 1)
    df['pnl'] = df['result'] * df['payout'] - (1 - df['result']) * df['stake']
    df['cumulative_pnl'] = df['pnl'].cumsum()
    df['cum_staked'] = df['stake'].cumsum()
    return df

def compute_metrics(df: pd.DataFrame) -> Dict[str, Any]:
    total_staked = df['stake'].sum()
    net_profit = df['pnl'].sum()
    roi = net_profit / total_staked if total_staked > 0 else 0.0
    win_rate = df['result'].mean() if len(df) > 0 else 0.0
    max_drawdown = compute_max_drawdown(df['cumulative_pnl'].to_numpy())
    avg_edge = df['edge'].mean()
    metrics = {
        'total_trades': len(df),
        'total_staked': float(total_staked),
        'net_profit': float(net_profit),
        'roi': float(roi),
        'win_rate': float(win_rate),
        'avg_edge': float(avg_edge),
        'max_drawdown': float(max_drawdown),
    }
    return metrics

def compute_max_drawdown(cum_returns: np.ndarray) -> float:
    if len(cum_returns) == 0:
        return 0.0
    peaks = np.maximum.accumulate(cum_returns)
    drawdowns = peaks - cum_returns
    return float(drawdowns.max())

def save_results(df: pd.DataFrame, metrics: Dict[str, Any], out_prefix: str):
    df.to_csv(f"{out_prefix}_trades.csv", index=False)
    with open(f"{out_prefix}_metrics.json", "w") as f:
        json.dump(metrics, f, indent=2, default=str)

if __name__ == '__main__':
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument('--input', required=True, help='historical fixture CSV')
    parser.add_argument('--out', default='backtest_output', help='output prefix')
    args = parser.parse_args()
    df = load_fixture(args.input)
    df_res = run_backtest(df)
    metrics = compute_metrics(df_res)
    save_results(df_res, metrics, args.out)
    print("Backtest done. Metrics:", metrics)
