# SMSPool API — response reference

Traceable source for the SMSPool response shapes the edge functions depend on.
Full collection is checked in as `docs.json` (Postman export, collection
`b2f10c80-0e84-45b9-a156-ebe58326e6b6`); this file is the human summary of the
endpoints we actually use. Sample responses dated 2024-01-06 / 2025.

All requests work as GET or POST. Non-list endpoints take `key` (your API key)
as a form field. Errors share one shape:

```json
{ "success": 0, "errors": [ { "message": "...", "param": "...", "description": "..." } ] }
```

---

## Numbers / rentals

### `service/retrieve_all` → bare array  ✔ confirmed
Name source for `resolveName(..., "service", id)`.
```json
[ { "ID": 1, "name": "1688", "favourite": 0 }, { "ID": 2, "name": "1Q", "favourite": 0 } ]
```

### `country/retrieve_all` → bare array  ✔ confirmed
Name source for `resolveName(..., "country", id)`. **No `key` required.** Identifier is `ID`.
```json
[ { "ID": 1, "name": "United States", "short_name": "US", "region": "North America" } ]
```

### `request/price` (body: `country`, `service`, `pool?`) → object  ✔ confirmed
**Carries NO names** — only IDs + price. This is why order-number's
`priceJson.service_name ?? service` always fell back to the numeric ID, and why
names must come from the `retrieve_all` catalogs.
```json
{ "pool": 7, "high_price": "0.24", "price": "0.24", "success_rate": 100 }
```

### `purchase/sms` (body: `country`, `service`, `pool?`, `max_price?`)
Success returns the number + order code; out-of-stock returns HTTP 422 with
`{ success: 0, message, pools: {...} }`. order-number reads `success`, `number`,
`order_code ?? orderid`.

### `request/success_rate` / `request/suggested_countries` / `pool/retrieve_valid`
Informational; use `country_id`/`pool` (NOT `ID`) — the resolver correctly avoids them.

---

## eSIM (data-only)  ✔ confirmed

Purchase-by-plan-ID; **no SMS/polling**. Flow: pick country → `esim/plans` →
pick plan → `esim/purchase` → `transactionId` → `esim/profile` for the
activation `ac` (an `LPA:` string → render as QR). `price` is USD.

### `esim/pricing` (body: `key`, `start?`, `length?`, `Search?`) → `{ data: [...] }`
Country list. `network` is a **JSON-encoded string** (see `parseNetwork`).
```json
{ "data": [ { "ID": 18, "name": "United Arab Emirates", "countryCode": "AE",
  "price": "0.40", "dataInGb": 0.1, "speed": "3G/4G/5G", "extendable": 2,
  "network": "[{\"country\":\"United Arab Emirates\",\"network\":[{\"operatorName\":\"Etisalat\",\"networkType\":\"5G\"}]}]" } ] }
```

### `esim/plans` (body: `key`, `country` = ISO code) → bare array
Plans for one country.
```json
[ { "ID": 975, "dataInGb": 0.1, "duration": 7, "price": "0.40",
    "speed": "3G/4G/5G", "ip": "HK", "extendable": 2, "network": "[...]" } ]
```

### `esim/purchase` (body: `key`, `plan`) → object
```json
{ "success": 1, "message": "Plan purchased successfully", "transactionId": "ABCDEFGHI123456" }
```

### `esim/profile` (body: `key`, `transactionId`) → object
Live activation + usage. `ac` is the QR/LPA string.
```json
{ "activated": 0, "ac": "LPA:1$rsp-eu.simlessly.com$ABCDEFGHI123456",
  "success": 1, "pin": "2811", "puk": "08992817", "apn": "plus",
  "smdp": "rsp-eu.simlessly.com", "activationCode": "ABCDEFGHI123456",
  "countryCode": "AM", "plan": 17, "remainingData": "3 GB", "totalData": "3 GB" }
```

### `esim/history` (body: `key`, `start?`, `length?`, `search?`) → `{ data, rows, page, limit }`
```json
{ "data": [ { "transactionId": "ABCDEFGHI123456", "countryCode": "us",
  "name": "United States", "cost": "0.10", "plan": 1, "timestamp": "2025-07-21",
  "expiration": "2025-10-05", "dataInGb": 50, "status": 2, "label": "Labels" } ],
  "rows": 1, "page": 1, "limit": 20 }
```

### `esim/topup_plans` (body: `plan`) → bare array   ·   `esim/topup` (body: `transactionId`, `plan`) → `{ success, message }`
Extend an existing eSIM's data. (Not wired up in v1.)

### `esim/delete` (body: `key`, `transactionId`) → `{ success, message: "eSIM archived successfully" }`
Archive an eSIM. (Not wired up in v1.)
