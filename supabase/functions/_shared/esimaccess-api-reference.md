# eSIM Access — Partner API reference

Generated from the official published Postman collection behind
<https://docs.esimaccess.com> (owner `11154627`, doc `2s93mBxf3q`).

- Base URL: `https://api.esimaccess.com` — **no sandbox exists**, cancel test orders to refund.
- Auth: header `RT-AccessCode: <accessCode>` on every request.
- Every endpoint is **POST with a JSON body** (unlike SMSPool's FormData).
- Rate limit: **8 requests/second**.
- Prices are integers scaled ×10 000 — `10000` = $1.00.
- Data volumes are in **bytes**. Times are UTC. Country codes are Alpha-2 ISO.
- Every response is `{ success, errorCode, errorMsg, obj }`.

Partner API

Deliver eSIM data plan packages via the eSIM Access HTTP API. Step by step overview.

Quick Start

Create an account at eSIM Access

Deposit funds for testing and refunding

Copy your AccessCode

Add your AccessCode below and run in your terminal or powershell to make your first API call

curl --location --request POST 'https://api.esimaccess.com/api/v1/open/balance/query'
--header 'RT-AccessCode: YOUR_ACCCESS_CODE'
--data ''

curl -Uri "https://api.esimaccess.com/api/v1/open/balance/query" `
     -Method POST `
     -Headers @{"RT-AccessCode"="YOUR_ACCESS_CODE"} `
     -Body ""

Version - V1

Version 1 - OCT 11, 2022 - Initial Release

Version 1.1 - JUN 6, 2023 - Updates:

Single Profile ordering changed to batch Profile ordering [via Order Profiles request]

Offline post-paying changed to online pre-paying [via Order Profiles request]

esim/list endpoint removed, status function found in esim/query

Cancel, Suspend, Unsuspend and Revoke functions added

Country filter added to Query All Data Packages

Webook for order status checking added

Version 1.2 - JUL 26, 2023 - Updates:

Added Top Up endpoint for adding data to existing eSIM profiles

Query available Top Up plans with iccid or packageCode

Price and amount optional when ordering a profile

Version 1.3 - DEC 12, 2023 - Updates:

Adds slug as an alias to package code

Adds additional package data like speed, network, and favorite

Version 1.4 Mar 12, 2024 - Updates:

Add SMS send to iccid ability

Adds ability to write webhooks

Version 1.5 July 28, 2024 - Updates:

Adds daypass plans with periodNum parameter in Order Profiles

Adds rate limit of 8 requests per second

Version 1.6 Dec 20, 2024 - Updates:

Adds fields supportTopUpType and ipExport

Update Mar 8, 2025

Adds additional webhook for low balance now at 25% and 10% remaining

Adds balance check endpoint with last updated date

Update Mar 19, 2025

Adds two new enpoints for balance check and current regions

Update May 28, 2025

Add new webhooks - SMDP_EVENT which give SM-DP+ server events

Update July 24, 2025

Top Up packages can be added after esim is created.

Update Dec 2, 2025

Adds datatype search fuppolicy result when viewing data packages.

Update Apr 1, 2026

Add support for Day Pass Plan top up

Environments and Endpoints

Sandbox:

There is no Sandbox environment. Cancel eSIM orders as needed in our live environment. Request funds for testing.

Production:

https://api.esimaccess.com

Image assets:

https://p.qrsim.net/

Authentication

Requst your API keys in your online account.

Standards

Time codes are presented in UTC. Country codes use Alpha-2 ISO. Data values are in Bytes.

Status

Server status tracked via postman monitors.

Rate Limit

8 API request per second are allowed.

Error Codes

Code |
Message |

000001 |
Server error |

000101 |
Request header (mandatory) is null |

000102 |
Wrong request header format |

000103 |
This https request method (get/post ) is not supported |

000104 |
Request in invalid JSON format |

000105 |
Request parameters (mandatory) are not contained |

000106 |
Request parameter (mandatory) is null |

000107 |
The length of the request parameter does not meet the requirement. |

101001 |
The timestamp of the request has expired. |

101002 |
This IP is in the blocklist. |

101003 |
Request signature mismatch. |

200002 |
This operation is not allowed due to the order status. |

200005 |
Package price error. Check price. |

200006 |
Total order price amount is wrong. Check prices. |

200007 |
Insufficient account balance |

200008 |
Order parameters error, please contact customer service. |

​​200009 |
Abnormal order status |

​​200010 |
Profile is being downloaded for the order. |

200011 |
Insufficient available Profiles for the package, please contact the customer service. |

310201 |
The bundle.code does not exist. |

310211 |
The data_plan_location.id does not exist. |

310221 |
The currencyId does not exist. |

310231 |
The carrierId does not exist. |

310241 |
The packageCode does not exist. |

310243 |
The package does not exist. |

310251 |
The vendor does not exist. |

310272 |
The orderNo does not exist. |

310403 |
The ICCID does not exist in the order. |

900001 |
The system is busy, please try again later. |

---

## Endpoints

### Get All Data Packages

`POST https://api.esimaccess.com/api/v1/open/package/list`

Request a list of all the available data packages offered. Optionally filter by country or region.

Additionaly request all of the Top Up plans available for a specific packageCode , slug or ICCID. Specific top ups work with specific plans. In general, countries can be reloaded with same country top up and region with same region top up.

Request Parameters

Name |
Type |
MOC |
Description |
Example |

locationCode |
String |
optional |
Filter by Alpha-2 ISO Country Code
!RG = Regional
!GL = Global |
JP
!GL
!RG |

type |
String |
optional |
BASE - Default product list
TOPUP - Top up product list |
BASE
TOPUP |

packageCode |
String |
optional |
Used with TOPUP to view top up package for a packageCode |
JC016 |

slug |
String |
optional |
slug is alias ofpackageCode |
AU_1_7 |

iccid |
String |
optional |
Include iccid with TOPUP to see available TOPUP plans |
48584984747372838 |

dataType |
String |
optional |
2 = Day Pass Plans
1 = Fixed Plans |
2 |

Reponse Parameters

Name |
Type |
MOC |
Description |
Example |

success |
String |
mandatory |
true: succeeded false: failed |
true |

errorCode |
String |
optional |
null or 0 when successful. Error code when failed. |
null |

errorMessage |
String |
optional |
Error code explanation |
null |

obj |
Object |
optional |
null : failed. Success includes: packageList |
 |

Domain |
Type |
MOC |
Description |
Example |

packageList |
List |
mandatory |
Available data packages, including: packageCode name price currencyCode volume unusedValidTime duration durationUnit location description activeType |
 |

packageCode |
String |
mandatory |
Package code |
JC016 |

slug |
String |
mandatory |
Package alias |
AU_1_7 |

name |
String |
mandatory |
Package name |
Asia 11 countries 1GB 30 Days |

price |
Integer |
mandatory |
Package price, value * 10,000 (10000 = $1.00) |
10000 |

currencyCode |
String |
mandatory |
Currency code |
USD |

volume |
Long |
mandatory |
Data volume (in bytes) of the package |
10485760 |

smsStatus |
Integer |
mandatory |
0.SMS not supported 1.API AND mobile phones SMS delivery 2.API SMS delivery only |
0 |

dataType |
Integer |
mandatory |
1.Data in Total
2.Daily Limit (Speed Reduced)
3.Daily Limit (Service Cut-off)
4.Daily Unlimited |
1 |

unusedValidTime |
Integer |
mandatory |
Time till package invalid |
30 |

duration |
Integer |
mandatory |
Plan validity peirod |
1 |

durationUnit |
String |
mandatory |
Time unit, used in unusedValidTime/duration |
DAY |

location |
String |
mandatory |
Alpha-2 ISO Country Code of package use |
CN,HK,ID,JP,MO,MY,PH,SG,KR,TW,TH,IN,VN,SA,KH,PK,LK |

description |
String |
mandatory |
Description of the data package |
Asia 11 countries |

activeType |
Integer |
mandatory |
Activation type: 1: First installation.
2: First network connection. |
1 |

favorite |
Boolean |
mandatory |
Favorited plan in console |
false |

retailPrice |
Integer |
mandatory |
Sug. Retail Price |
71000 |

speed |
String |
mandatory |
Network speed |
3G/4G |

locationNetworkList |
Array |
mandatory |
locationName , locationLogo , |
Spain
/img/es.png |

operatorList |
Array |
mandatory |
operatorName,
networkType |
T-Mobile 4G/5G |

ipExport |
String |
mandatory |
Data traffic exit country |
HK |

supportTopUpType |
Boolean |
mandatory |
Top up support 1 = no 2 = yes 3 = yes with periodNum |
2 |

fupPolicy |
String |
optional |
Fair Use Policy speed after full speed depleted |
384 Kbps |

**Request**

```json
{
    "locationCode": "",
    "type":"TOPUP",
    "slug":"VN_0.1_7",
    "packageCode":"",
    "iccid":""
}
```

**Response**

```json
{
    "errorCode": null,
    "errorMsg": null,
    "success": true,
    "obj": {
        "packageList": [
            {
                "packageCode": "CKH139",
                "name": "Slovenia 5GB 30Days",
                "price": 112500,
                "currencyCode": "USD",
                "volume": 5368709120,
                "unusedValidTime": 180,
                "duration": 30,
                "durationUnit": "DAY",
                "location": "SI",
                "description": "Slovenia 5GB 30Days",
                "activeType": 1,
                "favorite": false,
                "retailPrice": 112500,
                "speed": "3G/4G",
                "locationNetworkList": [
                    {
                        "locationName": "Slovenia",
                        "locationLogo": "https://static.redteago.com/img/logos/SloveniaFlag.png",
                        "operatorList": []
                    }
                ]
            }
        ]
    }
}
```

---

### Order Profiles

`POST https://api.esimaccess.com/api/v1/open/esim/order`

Order profiles individualy or in batch. After successful ordering, the SM-DP+ server will return the OrderNo and allocate profiles asynchronously for the order.

To make an order

Provide a uniqe transactionId for each order. Duplicate transactionId will be identified as the same request.

Provide the packageCode or slug of the data package(s) you will order.

Provide the count for each package needed.

Optional price check: Provide the price and multiply with count for the total cost to provide the amount.

Optional period: For daily plans include the periodNum corresponding to the number of days of the plan.

A successful order will generate an orderNo. Query all the allocated profiles in the endpoint /api/v1/open/esim/query

Request Parameters

Name |
Type |
MOC |
Description |
Example |

transactionId |
String |
mandatory |
User generated unique transaction ID. Max 50 chars, utf8mb4. If the request is retired, it needs to be contained; otherwise, a new transaction will be created. |
ABC-210-2s7Fr |

amount |
Long |
optional |
Total order amount |
20000 |

packageInfoList |
List |
mandatory |
packageCode or slug , count , price |
 |

Domain |
Type |
MOC |
Description |
Example |

packageCode |
String |
mandatory |
Order with slug or packageCode
(prefer slug)a |
AU_1_7
JC016 |

count |
Integer |
mandatory |
Number of packages to be ordered |
2 |

price |
Integer |
optional |
Package price, value * 10,000 (10000 = $1.00) |
10000 |

periodNum |
Integer |
optional |
Days of a daily plan. From 1-365. |
7 |

Response Parameters

Name |
Type |
MOC |
Description |
Example |

success |
String |
mandatory |
true: success false: failed |
true |

errorCode |
String |
optional |
null or 0 when successful. Error code when failed. |
null |

errorMessage |
String |
optional |
Error code explanation |
null |

obj |
Object |
optional |
Includes: orderNo |
 |

Domain |
Type |
MOC |
Description |
Example |

orderNo |
String |
mandatory |
Order number |
B22102010075311 |

**Request**

```json
{
    "transactionId":"your_txn_id",
    "amount":15000,
    "packageInfoList": [{
        "packageCode":"7aa948d363",
        "count":1,
        "price":15000
    }]
}
```

**Response**

```json
{
    "errorCode": null,
    "errorMsg": null,
    "success": true,
    "obj": {
        "orderNo": "B23051616050537"
        "transactionId": "Your_txn_id"
    }
}
```

---

### Query All Allocated Profiles

`POST https://api.esimaccess.com/api/v1/open/esim/query`

Query all eSIM profiles for both new eSIMs, and in use eSIMs.

Get New Orders

Query by orderNo or startTime and endTime range with paging options.

Use orderNo to request newly orderd eSIM profiles. The response will return the eSIM payload after all the allocated profiles are asynchronously allocated by the server. Expect wait times of up to 30 seconds. You can order up to 30 eSIMs in one batch and all profiles will be returnd with orderNo results.

If the profiles are not yet ready for download, the error will be returned (error code will be 200010, meaning SM-DP+ is still allocating profiles for the order).

Use the webhook notification "notifyType":"ORDER_STATUS" to inform your first get eSIM request. ORDER_STATUS webhook will trigger when the eSIM profiles have been created and ready for retrival.

Get Status of Existing Orders

Use esimTranNo , orderNo , or iccid to request the status of an eSIM including it's current orderUsage and eSIMStatus. Or use startTime and endTime range. esimTranNo and iccid will return a single eSIM, while orderNo will return the batch order of eSIMs.

Important Note: The value of orderUsage is updated within 2-3 hours after eSIM is in use.

Note: iccids are resued, thus the suggested method of eSIM status check is via esimTranNo.

Note: Rate limiting limits to 8 requests per second.

Understanding eSIM Profile Status

Results of several paramaters can identify the current state of any eSIM profile. For example:

eSIM Status |
smdpStatus |
esimStatus |
orderUsage |
eid |

New |
RELEASED |
GOT_RESOURCE |
0 |
"" |

Onboard |
ENABLED |
IN_USE GOT_RESOURCE |
0 |
"890…222" |

In Use |
ENABLED DISABLED |
IN_USE |
123 |
"890…222" |

Depleted |
ENABLED DISABLED |
USED_UP |
999 |
"890…222" |

Deleted |
DELETED |
USED_UP IN_USE |
999 |
"890…222" |

Request Parameters

Name |
Type |
MOC |
Description |
Example |

orderNo |
String |
optional |
Order number |
B2210206381924 |

iccid |
String |
optional |
eSIM ICCID |
89852246280001113119 |

startTime |
String |
optional |
Starting time (ISO UTC time) |
2010-06-30T01:20+00:00 |

endTime |
String |
optional |
End time (ISO UTC time) |
2010-06-30T02:20+00:00 |

pager |
PageParam |
mandatory |
Page parameters: pageSize pageNum |
 |

Domain |
Type |
MOC |
Description |
Example |

pageSize |
Integer |
mandatory |
Page size, value range: [5, 500] |
10 |

pageNum |
Integer |
mandatory |
Page number, value range: [1, 10000] |
1 |

Response Parameters

Name |
Type |
MOC |
Description |
Example |

success |
String |
mandatory |
true: succeeded false: failed |
true |

errorCode |
String |
optional |
null or 0 when successful. Error code when failed |
null |

errorMessage |
String |
optional |
Explanation of the error code |
null |

obj |
Object |
optional |
Includes: esimList pager |
 |

Domain |
Type |
MOC |
Description |
Example |

pager |
PageParam |
mandatory |
Includes: pageSize pageNum |
 |

esimList |
List |
mandatory |
List of eSIM Profiles, including: esimTranNo orderNo imsi iccid ac qrCodeUrl smdpStatus eid activeType expiredTime totalVolume totalDuration durationUnit orderUsage esimStatus packageList |
 |

PageParam Domain |
Type |
MOC |
Description |
Example |

pageSize |
Integer |
mandatory |
Page size, range: [5, 500] |
10 |

pageNum |
Integer |
mandatory |
Page number, value range: [1, 10000] |
1 |

total |
Long |
mandatory |
Total number of Profiles |
120 |

eSIM Domain |
Type |
MOC |
Description |
Example |

esimTranNo |
String |
mandatory |
eSIM transaction number |
22102706381912 |

orderNo |
String |
mandatory |
Order number |
B22102706381924 |

imsi |
String |
optional |
IMSI |
454006109846571 |

iccid |
String |
optional |
ICCID |
89852245280000942210 |

msisdn |
String |
optional |
MSISDN |
xxxxx |

smsStatus |
Integer |
mandatory |
0 Does not support SMS 1 Can accept SMS sent by mobile phones and API 2 Only SMS sent by API is acceptable. |
0 |

dataType |
Integer |
mandatory |
1.Data in Total
2.Daily Limit (Speed Reduced)
3.Daily Limit (Service Cut-off)
4.Daily Unlimited |
1 |

ac |
String |
mandatory |
eSIM Activation Code
LPA:1${SM-DP+_ADDRESS}${MATCHING_ID} |
LPA:1$rsp-eu.redteamobile.com$451F9802E6854E3E85FB985235EDB4E5 |

qrCodeUrl |
String |
mandatory |
QR Code URL |
http://static.redtea.io//hedy/qrcodes/image/d6dbada5054a4dfeb941e601327a4b42.png |

smdpStatus |
String |
mandatory |
SM-DP+ status: RELEASED: Profile is ready for download DOWNLOAD: Profile has been downloaded INSTALLATION: Profile has been installed ENABLED: Profile has been enabled DISABLED: Profile has been disabled DELETED: Profile has been deleted |
RELEASED |

eid |
String |
optional |
EID |
 |

activeType |
String |
mandatory |
Activation type: 1: First installation.
2: First network connection. |
1 |

expiredTime |
DateTime |
mandatory |
Expiration time |
2023-03-03T06:20:00+0000 |

totalVolume |
Long |
mandatory |
Total data volume (in bytes) in the package |
1073741824 |

totalDuration |
Integer |
mandatory |
Total valid period of the package |
7 |

durationUnit |
String |
mandatory |
Time unit |
DAY |

orderUsage |
Long |
mandatory |
Volume (in bytes) of used data |
0 |

pin puk |
String |
optional |
PIN, PUK values if any |
329393 |

apn |
String |
optional |
APN value |
drei.at |

esimStatus |
String |
mandatory |
CREATE an order has been created PAYING the subscriber is making payment for the eSIM PAID the eSIM has been paid GETTING_RESOURCE the eSIM is being allocated for the order GOT_RESOURCE the eSIM has been allocated for the order IN_USE the eSIM data package is in use USED_UP the data in the package is used up UNUSED_EXPIRED The valid period for eSIM download has expired USED_EXPIRED the valid period for the order activation has expired CANCEL the order has been canceled SUSPENDED the order has been suspended via suspend endpoint. REVOKE the order has been revoked via revoke endpoint. |
UNUSED_EXPIRED |

packageList |
List |
mandatory |
Includes: packageCode duration volume locationCode |
 |

eSIM Domain |
Type |
MOC |
Description |
Example |

packageCode |
String |
mandatory |
Package ID |
CKH179 |

duration |
Integer |
mandatory |
Valid period of the order |
7 |

volume |
Long |
mandatory |
Data volume (in bytes) in the order |
1073741824 |

locationCode |
String |
mandatory |
Country code of plan |
JP |

**Request**

```json
{
    "orderNo":"B25080914060004",
    "iccid":"",
    "pager":{
        "pageNum":1,
        "pageSize":50
    }
}
```

**Response**

```json
{
    "success": true,
    "errorCode": "0",
    "errorMsg": null,
    "obj": {
        "esimList": [
            {
                "esimTranNo": "23120118156818",
                "orderNo": "B23120118131854",
                "transactionId": "test344343433",
                "imsi": "232104070077567",
                "iccid": "8943108170000775671",
                "smsStatus": 1,
                "msisdn": "436789040077567",
                "ac": "LPA:1$rsp-eu.redteamobile.com$43DE23C67EE747BCAD6B63E8B67B261F",
                "qrCodeUrl": "https://p.qrsim.net/0fa4f29eb25b4d6c84ff4b8422a1da54.png",
                "shortUrl": "https://p.qrsim.net/0fa4f29eb25b4d6c84ff4b8422a1da54",
                "smdpStatus": "RELEASED",
                "eid": "",
                "activeType": 1,
                "dataType": 1,
                "activateTime": null,
                "expiredTime": "2024-05-29T18:34:17+0000",
                "totalVolume": 5368709120,
                "totalDuration": 30,
                "durationUnit": "DAY",
                "orderUsage": 0,
                "esimStatus": "CANCEL",
                "pin": "",
                "puk": "",
                "apn": "drei.at",
                "packageList": [
                    {
                        "packageName": "Spain 5GB 30Days",
                        "packageCode": "CKH003",
                        "slug": "ES_5_30",
                        "duration": 30,
                        "volume": 5368709120,
                        "locationCode": "ES",
                        "createTime": "2023-12-01T18:34:17+0000"
                    }
                ]
            }
        ],
        "pager": {
            "pageSize": 20,
            "pageNum": 1,
            "total": 1
        }
    }
}
```

---

### Cancel Profile

`POST https://api.esimaccess.com/api/v1/open/esim/cancel`

Cancel an inactive, unused eSIM profile.
The eSIM price is refunded to your balance.

This operation is available when esimStatus is GOT_RESOURCE and smdpStatus is RELEASED meaning the eSIM was created, but not installed on a device.

Cancel endpoint not available once user has used data with the eSIM.

It is reccomended to use the esimTranNo when making a cancel request.

Use the Cancel Profile endpoint to make refunds, test eSIM purchases and return the value of unused eSIM to your account balance.

Request Parameters

Name |
Type |
MOC |
Description |
Example |

iccid |
String |
optional |
eSIM ICCID |
89852246280001113119 |

esimTranNo |
String |
optional |
get from "Query All Allocated Profiles"

use "iccid" or "esimTranNo", can't be blank at the same time

recommended. |
24111319542101 |

Response Parameters

Name |
Type |
MOC |
Description |
Example |

success |
String |
mandatory |
true: succeeded false: failed |
true |

errorCode |
String |
optional |
null or 0 when successful. Error code when failed |
null |

errorMessage |
String |
optional |
Explanation of the error code |
null |

obj |
Object |
optional |
Includes |
{} |

**Request**

```json
{
    "esimTranNo": "23120118156818"
}
```

**Response**

```json
{
    "success": true,
    "errorCode": "0",
    "errorMsg": null,
    "obj": {}
}
```

---

### Suspend Profile

`POST https://api.esimaccess.com/api/v1/open/esim/suspend`

Request to suspend or pause data service to an esim profile.

Request Parameters

Name |
Type |
MOC |
Description |
Example |

iccid |
String |
optional |
eSIM ICCID |
89852246280001113119 |

esimTranNo |
String |
optional |
get from "Query All Allocated Profiles"

use "iccid" or "esimTranNo", can't be blank at the same time

recommended. |
24111319542101 |

Response Parameters

Name |
Type |
MOC |
Description |
Example |

success |
String |
mandatory |
true: succeeded false: failed |
true |

errorCode |
String |
optional |
null or 0 when successful. Error code when failed |
null |

errorMessage |
String |
optional |
Explanation of the error code |
null |

obj |
Object |
optional |
Includes |
{} |

**Request**

```json
{
    "iccid":"89852245280001138065"
}
```

---

### Unsuspend Profile

`POST https://api.esimaccess.com/api/v1/open/esim/unsuspend`

Request to unsuspend or reactivate data service to an esim profile.

Request Parameters

Name |
Type |
MOC |
Description |
Example |

iccid |
String |
optional |
eSIM ICCID |
89852246280001113119 |

esimTranNo |
String |
optional |
get from "Query All Allocated Profiles"

use "iccid" or "esimTranNo", can't be blank at the same time

recommended. |
24111319542101 |

Response Parameters

Name |
Type |
MOC |
Description |
Example |

success |
String |
mandatory |
true: succeeded false: failed |
true |

errorCode |
String |
optional |
null or 0 when successful. Error code when failed |
null |

errorMessage |
String |
optional |
Explanation of the error code |
null |

obj |
Object |
optional |
Includes |
{} |

**Request**

```json
{
    "iccid":"89852245280001138065"
}
```

---

### Revoke Profile

`POST https://api.esimaccess.com/api/v1/open/esim/revoke`

Request to close and remove an active eSIM and data plan. Non-refundable.

Request Parameters

Name |
Type |
MOC |
Description |
Example |

iccid |
String |
optional |
eSIM ICCID |
89852246280001113119 |

esimTranNo |
String |
optional |
get from "Query All Allocated Profiles"

use "iccid" or "esimTranNo", can't be blank at the same time

recommended. |
24111319542101 |

Response Parameters

Name |
Type |
MOC |
Description |
Example |

success |
String |
mandatory |
true: succeeded false: failed |
true |

errorCode |
String |
optional |
null or 0 when successful. Error code when failed |
null |

errorMessage |
String |
optional |
Explanation of the error code |
null |

obj |
Object |
optional |
Includes |
{} |

**Request**

```json
{
    "iccid":"89852245280001138065"
}
```

---

### Balance Query

`POST https://api.esimaccess.com/api/v1/open/balance/query`

Query the balance of a merchant account. Balance is used when ordering data profiles.

Request Parameters

None.

Reponse Parameters

Name |
Type |
MOC |
Description |
Example |

success |
String |
mandatory |
true: succeeded false: failed |
true |

errorCode |
String |
optional |
null or 0 when successful. Error code when failed. |
null |

errorMessage |
String |
optional |
Explanation of the error code |
null |

obj |
Object |
optional |
Includes: balance |
 |

Domain |
Type |
MOC |
Description |
Example |

balance |
Long |
mandatory |
Merchant balance, expressed *10000 (100000 = $10.00) |
100000 |

**Response**

```json
{
    "success": true,
    "errorCode": "0",
    "errorMsg": null,
    "obj": {
        "balance": 940000
    }
}
```

---

### Top Up

`POST https://api.esimaccess.com/api/v1/open/esim/topup`

Before making a top up, it is reccomended to query the available top up plans (Get All Data Packages endpoint) for a specific iccid , esimTranNoor packageCode first. This will give you available top up packages specific to this eSIM. Also supportTopUpType 2 or 3 means that plan suports top up. Learn more about top ups.

The top up endpoint allows an existing installed eSIM to be loaded with a new plan. To top up the plan, you need its ICCID or esimTranNo and the compatible top up data plan packageCode. and periodNum in case of Day Pass extensions.

Top ups can be requested while the eSIM is in New, In Use or Depleted status, but not after eSIM expiry.

Request Parameters

Name |
Type |
MOC |
Description |
Example |

iccid |
String |
optional |
eSIM ICCID (depreciated, use esimTranNo ) |
89852246280001113119 |

esimTranNo |
String |
optional |
get from "Query All Allocated Profiles" |
24111319542101 |

packageCode |
String |
required |
Use a recharge packageCode starting with "TOPUP_" or use slug Learn more |
TOPUP_SM001
AU_1_7 |

amount |
String |
optional |
Price of package, if used will be verified. |
10000 |

transactionId |
String |
required |
User created transaction ID |
TXN-123 |

periodNum |
String |
optional |
Number of days to extend |
5 |

Respone Parameters

obj |
Type |
MOC |
Description |
Example |

transactionId |
String |
required |
Transaction ID returned |
TXN-123 |

iccid |
String |
required |
ICCID of the eSIM |
89852245280001354019 |

expiredTime |
Long |
required |
New date of pakcage expiry |
2023-08-17T17:01:37+0000 |

totalVolume |
Long |
required |
New voulme of data |
4294967296 |

totalDuration |
Integer |
required |
New duration in days |
28 |

orderUsage |
Long |
required |
Total data usage |
207239584 |

topUpEsimTranNo |
String |
required |
Unique transaction number of the top up |
26032702180013 |

**Request**

```json
{
    "esimTranNo":"",
    "iccid":"89852000263213655345",
    "packageCode":"TOPUP_JC172",
    "transactionId": "1747191693771_topup_partner7"
}
```

**Response**

```json
{
    "errorCode": null,
    "errorMsg": null,
    "success": true,
    "obj": {
        "transactionId": "your_transaction_id_here",
        "iccid": "89852245280001354019",
        "expiredTime": "2023-09-07T17:01:37+0000",
        "totalVolume": 7516192768,
        "totalDuration": 49,
        "orderUsage": 6841270782
    }
}
```

---

### Set Webhook

`POST https://api.esimaccess.com/api/v1/open/webhook/save`

Set or update your webhook URL via an API call. You can find the result in your console account here.

You can also view the currently set webhook with the following endpoint:
/api/v1/open/webhook/query

**Request**

```json
{"webhook":"https://webhook.endpoint.site/unique-webhook"}
```

**Response**

```json
{
    "success": true,
    "errorCode": "0",
    "errorMsg": null,
    "obj": {}
}
```

---

### Send SMS

`POST https://api.esimaccess.com/api/v1/open/esim/sendSms`

This endpoint is used to send SMS to an eSIM via iccid or esimTranNo. Supported by some networks. Only installed eSIMs that supports receiving SMS will work.

The smsStatus parameter in the /order and /package endpoints indicates whether the eSIM supports receiving SMS ( "smsStatus": 1 or 2) . There is currently no cost for SMS delivery.

Request Parameters

Name |
Type |
MOC |
Description |
Example |

iccid |
String |
optional |
eSIM ICCID |
89852246280001113119 |

esimTranNo |
 |
optional |
get from "Query All Allocated Profiles"

use "iccid" or "esimTranNo", can't be blank at the same time

recommended. |
24111319542101 |

message |
String(500) |
required |
SMS message, up to 500 characters. |
"Thank you for using our eSIM service" |

**Request**

```json
{
    "esimTranNo":"23072017992029",
    "message":"Your Message!"
}
```

**Response**

```json
{
    "success": true,
    "errorCode": "0",
    "errorMsg": null,
    "obj": {}
}
```

---

### Usage Check

`POST https://api.esimaccess.com/api/v1/open/esim/usage/query`

Check the data usage of up to 10 eSIMs via their esimTranNo. Returns the amout of dataUsage, the totalData in the plan, and the lastUpdateTime timestamp of the most recent data used value update.

Important Note: Data usage is updated every 2-3 hours and is not real time.

Field |
Type |
Description |
Example |

esimTranNo |
String |
eSIM transaction number |
23072017992029 |

dataUsage |
Long |
Data usage in Bytes |
1453344832 |

totalData |
Long |
Total data in Bytes |
5368709120 |

lastUpdateTime |
String |
The timestamp for the last call record update. For file-based records, this is the last full hour of settlement; for carrier data usage notifications, it is the settlement time recorded in the notification; for the carrier’s real-time call record API, it is the time when the API was called. |
2025-03-19T18:00:00+0000 |

**Request**

```json
{
  "esimTranNoList": ["25030303480009"]
}
```

**Response**

```json
{
    "success": true,
    "errorCode": "0",
    "errorMsg": null,
    "obj": {
        "esimUsageList": [
            {
                "esimTranNo": "25031120490003",
                "dataUsage": 1453344832,
                "totalData": 5368709120,
                "lastUpdateTime": "2025-03-19T18:00:00+0000"
            }
        ]
    }
}
```

---

### Supported Regions

`POST https://api.esimaccess.com/api/v1/open/location/list`

Check our currently supported countries and plan codes.

Field |
Type |
Description |
Example |

code |
String |
Region code |
ES NA-3 |

name |
String |
Region name |
Spain North America |

type |
Integer |
Region type: 1 for single-country, 2 for multi-country |
1 |

subLocation |
List |
Sub-regions (exists only when type = 2) |
 |

Each SubLocation object contains:

Field |
Type |
Description |
Example |

code |
String |
Region code |
 |

name |
String |
Region name |
 |

**Request**

```json
{}
```

**Response**

```json
{
    "success": true,
    "errorCode": "0",
    "errorMsg": null,
    "obj": {
        "locationList": [
            {
                "code": "ES",
                "name": "Spain",
                "type": 1,
                "subLocationList": null
            },
            {
                "code": "HK",
                "name": "Hong Kong (China)",
                "type": 1,
                "subLocationList": null
            },
            {
                "code": "MO",
                "name": "Macao (China)",
                "type": 1,
                "subLocationList": null
            },
            {
                "code": "TH",
                "name": "Thailand",
                "type": 1,
                "subLocationList": null
            },
            {
                "code": "NL",
                "name": "Netherlands",
                "type": 1,
                "subLocationList": null
            },
            {
                "code": "IL",
                "name": "Israel",
                "type": 1,
                "subLocationList": null
            },
            {
                "code": "TR",
                "name": "Turkey",
                "type": 1,
                "subLocationList": null
            },
            {
                "code": "JO",
                "name": "Jordan",
                "type": 1,
                "subLocationList": null
            },
            {
                "code": "KW",
                "name": "Kuwait",
                "type": 1,
                "subLocationList": null
            },
            {
                "code": "OM",
                "name": "Oman",
                "type": 1,
                "subLocationList": null
            },
            {
                "code": "QA",
                "name": "Qatar",
                "type": 1,
                "subLocationList": null
            },
            {
                "code": "AM",
                "name": "Armenia",
                "type": 1,
                "subLocationList": null
            },
            {
                "code": "AE",
                "name": "United Arab Emirates",
                "type": 1,
                "subLocationList"
… (truncated)
```

---

## Webhooks

Endpoint Setup

Adding your webhook the first time will trigger a test webhook send. If you have a correctly working endpoint, you will receive an CHECK_HEALTH event. If our test send fails, your endpoint cannot be saved. To check a valid endpoint try https://webhook.site/

Set your webhook URL to receive POST requests. The notifications contain a notifyType field indicating the event category and a content object with specific details.

Envelope Structure

Every notification has these top-level fields:

{
  "notifyType": "ORDER_STATUS",
  "notifyId": "447602ac1e5c4bb4980f786b0c2934d6",
  "eventGenerateTime": "2026-04-22T17:16:34Z",
  "content": { ... }
}

Field |
Type |
Description |

notifyType |
string |
Event type (see sections below) |

notifyId |
string |
Unique event ID for deduplication |

eventGenerateTime |
string (ISO 8601) |
When the event was generated upstream |

content |
object |
Event-specific payload (varies by notifyType) |

Deduplication: Use notifyId to detect and ignore duplicate deliveries.

Event Types

Six notifyType values exist, listed from most to least common:

notifyType |
Frequency |
Purpose |

SMDP_EVENT |
Very high |
Low-level SM-DP+ profile state transitions |

ESIM_STATUS |
High |
eSIM lifecycle status changes |

ORDER_STATUS |
Medium |
Order fulfillment state changes |

DATA_USAGE |
Medium |
Data consumption threshold alerts |

VALIDITY_USAGE |
Medium |
Validity period expiry warnings |

CHECK_HEALTH |
Rare |
Connectivity check on initial webhook setup |

ORDER_STATUS

Fired when an order reaches a new fulfillment state. This is the primary signal that an eSIM has been provisioned and is ready for retrieval.

Content Fields

Field |
Type |
Description |

orderNo |
string |
Provider order number (e.g. B26042217160011) |

orderStatus |
string |
Fulfillment state (see below) |

transactionId |
string |
Your transaction ID from the original order |

orderStatus Values

Value |
Meaning |

GOT_RESOURCE |
eSIM profile allocated and ready for download |

Sample Payload

{
  "notifyType": "ORDER_STATUS",
  "notifyId": "447602ac1e5c4bb4980f786b0c2934d6",
  "eventGenerateTime": "2026-04-22T17:16:34Z",
  "content": {
    "orderNo": "B26042217160011",
    "orderStatus": "GOT_RESOURCE",
    "transactionId": "7544949834056-1-TR_50_30"
  }
}

Developer Notes

This is the most important event for order fulfillment. When you receive GOT_RESOURCE, call the Query Allocated Profiles endpoint (/api/v1/open/esim/query) with the orderNo to retrieve the ICCID and QR code.

The ICCID is not included in this event. You must query for it.

Applies to new orders only. Top-up orders do not trigger ORDER_STATUS notifications.

If this event is not received, fall back to polling the query endpoint.

ESIM_STATUS

Fired when the high-level eSIM lifecycle status changes. Covers the full lifecycle from active use through expiry, cancellation, or revocation.

Content Fields

Field |
Type |
Always Present |
Description |

iccid |
string |
Yes |
eSIM identifier |

orderNo |
string |
Yes |
Provider order number |

esimTranNo |
string |
Yes |
Provider transaction number |

transactionId |
string |
Yes |
Your transaction ID |

esimStatus |
string |
Yes |
eSIM lifecycle state |

smdpStatus |
string |
Yes |
SM-DP+ profile state |

totalVolume |
number |
Sometimes |
Total data in bytes |

orderUsage |
number |
Sometimes |
Bytes consumed |

remainVolume |
number |
Sometimes |
Bytes remaining |

orderStatus |
string |
Rarely |
Occasionally carries GOT_RESOURCE |

esimStatus Values

Value |
Meaning |

IN_USE |
Profile is active and being used |

USED_UP |
All data has been consumed |

USED_EXPIRED |
Data used and validity period has expired |

UNUSED_EXPIRED |
Validity expired with no data usage |

CANCEL |
Order was cancelled |

REVOKED |
Profile was administratively revoked |

SUSPENDED |
Profile temporarily suspended |

smdpStatus Values

Value |
Meaning |

RELEASED |
Profile created but not yet downloaded |

DOWNLOAD |
Profile download in progress |

INSTALLATION |
Profile being installed on device |

ENABLED |
Profile active and enabled on device |

DISABLED |
Profile present but disabled on device |

DELETED |
Profile removed from device |

Common Status Combinations

These are the most frequently observed pairings (highest volume first):

esimStatus |
smdpStatus |
What It Means |

IN_USE |
ENABLED |
Active and turned on. The normal healthy state. |

USED_EXPIRED |
DISABLED |
Plan finished, profile turned off. End of lifecycle. |

IN_USE |
INSTALLATION |
Active but profile still installing on device. |

IN_USE |
DISABLED |
User has disabled (toggled off) the eSIM on their device. |

USED_EXPIRED |
ENABLED |
Expired but profile still enabled. Will likely be disabled soon. |

USED_EXPIRED |
DELETED |
Expired and user deleted the profile from device. Terminal state. |

USED_UP |
ENABLED |
All data consumed but profile still enabled. Good time to prompt top-up. |

CANCEL |
RELEASED |
Cancelled before download. Profile was never used. |

UNUSED_EXPIRED |
RELEASED |
Expired without ever being installed. Customer never used the eSIM. |

Sample Payload

{
  "notifyType": "ESIM_STATUS",
  "notifyId": "83eb2b243a5545d38ec26cebfcf4bd8d",
  "eventGenerateTime": "2026-04-22T17:27:44Z",
  "content": {
    "iccid": "8910300000059824319",
    "orderNo": "B26042216320015",
    "esimTranNo": "26042216320015",
    "transactionId": "7488352420083-1-ES_10_30",
    "esimStatus": "IN_USE",
    "smdpStatus": "ENABLED"
  }
}

Developer Notes

This is the best event type for tracking the overall eSIM lifecycle in your application.

A transition to IN_USE + ENABLED confirms the customer has successfully installed and activated their eSIM.

USED_UP + ENABLED is the ideal moment to prompt for a top-up.

CANCEL / REVOKED / SUSPENDED indicate non-normal states that may require customer support action.

Data volume fields (totalVolume, orderUsage, remainVolume) are not always present. Use DATA_USAGE events for reliable usage tracking.

SMDP_EVENT

The highest-volume event type. Fired by the SM-DP+ server on every low-level profile state machine transition. These reflect RSP (Remote SIM Provisioning) protocol steps.

Content Fields

Field |
Type |
Always Present |
Description |

iccid |
string |
Yes |
eSIM identifier |

eid |
string |
Yes |
eUICC Identifier (32-hex device hardware ID) |

orderNo |
string |
Yes |
Provider order number |

esimTranNo |
string |
Yes |
Provider transaction number |

transactionId |
string |
Yes |
Your transaction ID |

esimStatus |
string |
Yes |
eSIM lifecycle state (same values as ESIM_STATUS) |

smdpStatus |
string |
Yes |
SM-DP+ profile state (same values as ESIM_STATUS) |

timestamp |
string |
Yes |
Event timestamp (ISO 8601) |

seqNumber |
number or null |
Yes |
SM-DP+ protocol sequence number |

notifyStatus |
string |
Sometimes |
Operation result |

notifyStatus Values

Value |
Meaning |

null / absent |
Intermediate state transition (operation in progress) |

Executed-Success |
SM-DP+ operation completed successfully |

Installation Lifecycle Sequence

A normal installation produces these SMDP_EVENT transitions in order:

1. esimStatus=GOT_RESOURCE, smdpStatus=DOWNLOAD       Profile download initiated
2. esimStatus=GOT_RESOURCE, smdpStatus=INSTALLATION    Profile installing on device
3. esimStatus=GOT_RESOURCE, smdpStatus=ENABLED         Profile enabled, ready for use
4. esimStatus=IN_USE,       smdpStatus=ENABLED         User is consuming data

Sample Payload

{
  "notifyType": "SMDP_EVENT",
  "notifyId": "7d6ab37b44b9461087569ad4393a8b4c",
  "eventGenerateTime": "2026-04-22T17:29:40Z",
  "content": {
    "iccid": "8910300000059818839",
    "eid": "89049032005008882600050326403713",
    "orderNo": "B26042112200025",
    "esimTranNo": "26042112200028",
    "transactionId": "7542454845768-1-GR_1_7",
    "esimStatus": "IN_USE",
    "smdpStatus": "ENABLED",
    "timestamp": "2026-04-22T17:29:40Z",
    "seqNumber": 113,
    "notifyStatus": "Executed-Success"
  }
}

Developer Notes

This is a high-volume event. Expect many events per eSIM throughout its lifecycle.

Unlike ESIM_STATUS, this event includes eid (the device hardware identifier) and seqNumber.

The GOT_RESOURCE esimStatus appears here during provisioning — it does not appear in ESIM_STATUS events.

DOWNLOAD without a subsequent INSTALLATION may indicate the customer had trouble installing. Consider flagging for support.

Most integrations should use ESIM_STATUS for business logic and only use SMDP_EVENT for detailed diagnostics or installation tracking.

DATA_USAGE

Fired when data consumption crosses a threshold percentage. Used for low-data warnings and usage tracking.

Content Fields

Field |
Type |
Description |

iccid |
string |
eSIM identifier |

orderNo |
string |
Provider order number |

esimTranNo |
string |
Provider transaction number |

transactionId |
string |
Your transaction ID |

totalVolume |
number |
Total data allowance in bytes |

orderUsage |
number |
Bytes consumed so far |

remain |
number |
Bytes remaining |

remainThreshold |
number |
Threshold that triggered this alert (decimal, e.g. 0.5 = 50%) |

lastUpdateTime |
string (ISO 8601) |
When usage was last calculated |

Sample Payload

{
  "notifyType": "DATA_USAGE",
  "notifyId": "7cb37a1e9ed2468e9243e6ccae682125",
  "eventGenerateTime": "2026-04-22T17:21:59Z",
  "content": {
    "iccid": "89852240810732202668",
    "orderNo": "B26041615170028",
    "esimTranNo": "26041615170028",
    "transactionId": "7533748552008-1-TH_20_30",
    "totalVolume": 21474836480,
    "orderUsage": 10741066164,
    "remain": 10733770316,
    "remainThreshold": 0.5,
    "lastUpdateTime": "2026-04-22T15:53:03Z"
  }
}

Data Conversion

All values are in bytes. To convert:

KB = bytes / 1024
MB = bytes / 1048576
GB = bytes / 1073741824

Example from the sample above:

Total: 21,474,836,480 bytes = 20 GB

Used: 10,741,066,164 bytes = 10.0 GB (50%)

Remaining: 10,733,770,316 bytes = 10.0 GB

Developer Notes

Data usage updates are delayed 1-3 hours. Do not treat as real-time.

Receiving a DATA_USAGE event is the strongest confirmation that the eSIM is working and the customer is using data.

remainThreshold values observed: 0.5 (50%), 0.1 (10%), and others. You may receive multiple alerts as different thresholds are crossed.

Use for low-data notifications, usage dashboards, and top-up prompts.

All DATA_USAGE events reference the original order. After a top-up, totalVolume will increase but orderNo remains the original.

VALIDITY_USAGE

Fired when the eSIM's validity period is running low. Used for expiry warnings.

Content Fields

Field |
Type |
Description |

iccid |
string |
eSIM identifier |

orderNo |
string |
Provider order number |

esimTranNo |
string |
Provider transaction number |

transactionId |
string |
Your transaction ID |

remain |
number |
Days remaining |

totalDuration |
number |
Original validity period |

durationUnit |
string |
Unit for remain and totalDuration (always DAY) |

expiredTime |
string (ISO 8601) |
Exact expiration timestamp |

Sample Payload

{
  "notifyType": "VALIDITY_USAGE",
  "notifyId": "d84977dbcdbd48eb96379300b1605b04",
  "eventGenerateTime": "2026-04-22T17:13:54Z",
  "content": {
    "iccid": "8981440039980773689",
    "orderNo": "B26032416140018",
    "esimTranNo": "26032416140018",
    "transactionId": "6900674724119-1-JP_5_30_IIJ",
    "remain": 1,
    "totalDuration": 30,
    "durationUnit": "DAY",
    "expiredTime": "2026-04-23T17:13:19Z"
  }
}

Developer Notes

Typically fired when 1 day remains before expiration.

After expiry, no more top-ups are possible. This is the last opportunity to notify the customer.

Use expiredTime for the exact cutoff — remain is approximate.

Unlike DATA_USAGE, the remain field here is in days, not bytes.

CHECK_HEALTH

A connectivity check sent once when the webhook URL is first configured. Not related to any real eSIM or order.

Content Fields

Field |
Type |
Description |

orderNo |
string |
Always "1234567890" (synthetic) |

orderStatus |
string |
Always "Test" |

Sample Payload

{
  "notifyType": "CHECK_HEALTH",
  "notifyId": "918ff7f6f41143078585a85797e613f7",
  "eventGenerateTime": "2026-04-22T11:31:33Z",
  "content": {
    "orderNo": "1234567890",
    "orderStatus": "Test"
  }
}

Developer Notes

Sent exactly once during webhook configuration. If you don't receive it, your endpoint URL may be misconfigured.

Respond with HTTP 200 to confirm receipt.

Ignore for all business logic. Use only for setup verification.

IP Whitelist

For additional security, you can whitelist the following sender IPs:

3.1.131.226

54.254.74.88

18.136.190.97

18.136.60.197

18.136.19.137

Note: The content object structure may vary slightly. Always inspect the received payload to understand all available fields for each notifyType.

Look at our example webhook sending and test trigger form.