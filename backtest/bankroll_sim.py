# backtest/bankroll_sim.py
# Simulate staking strategies: flat, percent, Kelly (fractional)
import numpy as np
import pandas as pd

def simulate_strategy(df, strategy='flat', param=1.0, starting_bankroll=10000, kelly_fraction=1.0):
    """
    df must include columns: model_prob, market_odds, result (1/0)
    strategy:
      - 'flat': stake=param fixed amount
      - 'percent': stake = param * bankroll (param in (0,1))
      - 'kelly': stake = kelly_fraction * (kelly_fraction_calc) * bankroll
    Returns dataframe with bankroll trajectory and stats
    """
    bankroll = starting_bankroll
    traj = []
    for _, row in df.iterrows():
        edge = row['model_prob'] - 1.0/row['market_odds']
        if strategy == 'flat':
            stake = param
        elif strategy == 'percent':
            stake = param * bankroll
        elif strategy == 'kelly':
            b = row['market_odds'] - 1
            p = row['model_prob']
            q = 1 - p
            # Kelly fraction (edge / odds)
            kelly = max((b * p - q) / b, 0.0) if b > 0 else 0.0
            stake = kelly_fraction * kelly * bankroll
        else:
            raise ValueError("unknown strategy")
        stake = min(stake, bankroll)  # can't stake more than bankroll
        payout = stake * (row['market_odds'] - 1) if row['result'] == 1 else -stake
        bankroll += payout
        traj.append({'timestamp': row.get('timestamp', None),
                     'stake': stake,
                     'pnl': payout,
                     'bankroll': bankroll,
                     'edge': edge})
    return pd.DataFrame(traj)

# Example usage:
# df = pd.read_csv('backtest_trades.csv')
# sim = simulate_strategy(df, strategy='percent', param=0.01)
