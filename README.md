# AMD x FVG Telegram Signal Bot for Railway — OKX version

This version uses OKX public candles instead of Binance/Bybit. It does not use TradingView alerts.

## Railway variables

Set these in Railway → Variables:

```
TELEGRAM_BOT_TOKEN=your_real_bot_token
TELEGRAM_CHAT_ID=your_real_chat_id
SYMBOLS=BTCUSDT,SOLUSDT,ADAUSDT,ETHUSDT,AAVEUSDT,LINKUSDT,XRPUSDT,TRUMPUSDT
INTERVAL=1h
POLL_SECONDS=60
OKX_MARKET=SWAP
OKX_KLINES_LIMIT=300
SEND_STARTUP_MESSAGE=true
DEBUG=true
NOTIFY_LOOKBACK_CANDLES=2
IGNORE_HISTORY_ON_START=true
```

## Symbol format

You can use Binance-style symbols like `BTCUSDT`; the bot converts them automatically:

- `BTCUSDT` → `BTC-USDT-SWAP` when `OKX_MARKET=SWAP`
- `BTCUSDT` → `BTC-USDT` when `OKX_MARKET=SPOT`

You can also pass exact OKX symbols directly, for example:

```
SYMBOLS=BTC-USDT-SWAP,SOL-USDT-SWAP,ETH-USDT-SWAP
```

## Notes

- `SWAP` means OKX USDT perpetual futures.
- `SPOT` means OKX spot pairs.
- If a coin does not exist on OKX, Railway logs will show an OKX API error for that symbol. Remove that symbol or switch market type.
- Signals may still differ from TradingView if your TradingView chart is from another exchange or market type.
