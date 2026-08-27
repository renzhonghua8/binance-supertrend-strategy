# Binance Supertrend 趋势跟随策略

> 状态：规则评审阶段，尚未进入自动交易代码开发。

本仓库用于确认一套基于 Binance USDT 永续合约涨幅榜与多周期 Supertrend 的机械化做多策略。

- [完整策略规则](STRATEGY.md)
- [待确认决策](REVIEW-CHECKLIST.md)
- [自动交易系统使用说明](dashboard/README.md)

`dashboard/` 已包含双通道自动交易控制台。纸面交易与Binance实盘使用两个隔离引擎，可同时运行，并分别维护连接、仓位、统计、日志和API凭据。默认不会连接真实账户，也不会自动启动策略。

已部署的CentOS服务器升级双通道请使用 [`DUAL-CHANNEL-UPGRADE.md`](./DUAL-CHANNEL-UPGRADE.md)。

## 重要说明

该策略采用全仓保证金、交易所杠杆设置 5 倍、实际名义敞口约为账户权益 2 倍，并取消追高限制，风险较高。文档是策略规格，不构成投资建议，也不保证收益。
