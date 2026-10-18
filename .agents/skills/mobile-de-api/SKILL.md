---
name: mobile-de-api
description: Comprehensive guide and technical manual for interacting with the mobile.de REST API (Seller-API, Insights-API, Reference Data, Lead-API), including authentication, JSON schemas, image upload pipelines, and error handling.
---

# mobile.de REST API Engineering Skill

This skill documents how the ACAR Dealership Operating System interacts with Germany's largest automotive marketplace, **mobile.de**, via its official REST API.

---

## 1. Environments & Base URLs

| Environment | Base URL | Usage |
| :--- | :--- | :--- |
| **Sandbox (Test)** | `https://services-sandbox.mobile.de` | Testing ad insertions and API integrations without public visibility |
| **Production** | `https://services.mobile.de` | Live marketplace visible to car buyers |

Controlled in backend via `.env` / configuration (`MOBILE_DE_USE_SANDBOX=True/False`). The client-facing UI should remain clean and not expose internal environment selectors.

---

## 2. Authentication & Headers

mobile.de uses **HTTP Basic Authentication** over TLS/HTTPS.

### Headers:
```http
Authorization: Basic <base64(username:password)>
Accept: application/vnd.de.mobile.api+json
Content-Type: application/vnd.de.mobile.api+json
Accept-Language: de
```

### Self-Uploading Dealers:
- In ACAR, each dealership business has its own `mobileSellerId`, `api_username`, and `api_password`.
- All seller endpoints follow: `/seller-api/sellers/{mobileSellerId}/...`
- The `mobileSellerId` is an internal integer distinct from the public customer number (`Kundennummer`).

---

## 3. Core Seller-API Endpoints

| Operation | HTTP Method | Endpoint Path | Description |
| :--- | :--- | :--- | :--- |
| **Create Ad** | `POST` | `/seller-api/sellers/{sellerId}/ads` | Insert a new car listing |
| **Get Ad** | `GET` | `/seller-api/sellers/{sellerId}/ads/{adId}` | Retrieve full details of an existing listing |
| **Update Ad** | `PUT` | `/seller-api/sellers/{sellerId}/ads/{adId}` | Full update of an existing ad |
| **Delete Ad** | `DELETE` | `/seller-api/sellers/{sellerId}/ads/{adId}` | Remove / unpublish listing |
| **List Ads** | `GET` | `/seller-api/sellers/{sellerId}/ads` | Paginated list of all active/paused ads |
| **Upload Image**| `POST` | `/seller-api/sellers/{sellerId}/images` | Upload binary image and get reference URI |
| **Statistics** | `GET` | `/seller-api/sellers/{sellerId}/ads/{adId}/statistics` | Detail views, search hits, favorites, leads |
| **Price Rating**| `GET` | `/seller-api/sellers/{sellerId}/ads/{adId}/pricerating` | Market price rating (e.g. `GOOD_PRICE`) |

### Idempotency Header:
When inserting or updating an ad, always supply:
```http
X-Mobile-Insertion-Request-Id: <uuid4>
```
This guarantees that retries on network timeouts will never generate duplicate listings.

---

## 4. Image Upload & Attachment Pipeline

Images cannot be sent inline in the ad JSON. Instead, follow this 2-step process:

1. **Upload Binary Image:**
   - `POST /seller-api/sellers/{sellerId}/images`
   - Header: `Content-Type: image/jpeg` or `image/png`
   - Body: Raw binary bytes of photo
   - Response (`201 Created`):
     ```http
     Location: https://services.mobile.de/seller-api/sellers/{sellerId}/images/{imageId}
     ```
2. **Attach References in Ad Payload (in desired display order):**
   ```json
   "images": [
     { "ref": "https://services.mobile.de/seller-api/sellers/{sellerId}/images/{id1}" },
     { "ref": "https://services.mobile.de/seller-api/sellers/{sellerId}/images/{id2}" }
   ]
   ```

---

## 5. Complete Ad Creation Schema (`Car`)

```json
{
  "ad": {
    "vehicle": {
      "class": "Car",
      "category": "EstateCar",
      "make": "AUDI",
      "model": "A4",
      "modelDescription": "2.0 TDI Avant S line Matrix Virtual Navi",
      "specifics": {
        "mileage": 85000,
        "firstRegistration": "2020-06",
        "power": 140,
        "powerUnit": "KW",
        "gearbox": "AUTOMATIC_GEAR",
        "fuel": "DIESEL",
        "doorCount": "FOUR_OR_FIVE",
        "exteriorColor": "GREY",
        "metallic": true,
        "condition": "USED",
        "numberOfPreviousOwners": 1,
        "accidentDamaged": false,
        "fullServiceHistory": true,
        "hu": "2025-08"
      },
      "features": [
        "ABS",
        "ALLOY_WHEELS",
        "BLUETOOTH",
        "CRUISE_CONTROL",
        "ELECTRIC_HEATED_SEATS",
        "FOUR_WHEEL_DRIVE",
        "NAVIGATION_SYSTEM",
        "PARKING_SENSORS",
        "XENON_HEADLIGHTS"
      ],
      "environment": {
        "emissionClass": "EURO6",
        "emissionBadge": "GREEN",
        "fuelConsumption": {
          "combined": 5.2,
          "unit": "L_100KM"
        },
        "co2Emission": {
          "combined": 136,
          "unit": "G_KM"
        },
        "efficiencyClass": "A"
      }
    },
    "price": {
      "consumerPriceGross": 26900.00,
      "currency": "EUR",
      "vatRate": 19.00,
      "negotiable": false,
      "vatType": "VAT_CLAIMABLE"
    },
    "description": "Very clean, accident-free Audi A4 Avant S-Line.",
    "images": [
      { "ref": "https://services.mobile.de/seller-api/sellers/12345/images/987654321" }
    ],
    "customProperties": {
      "internalId": "ACAR-1042"
    }
  }
}
```

---

## 6. Insights & Statistics Mapping

Call `GET /seller-api/sellers/{sellerId}/ads/{adId}/statistics`:
- `detailViews` -> Direct page impressions on mobile.de.
- `searchHits` -> Number of times vehicle appeared in search results.
- `parkings` -> Number of users who bookmarked the vehicle in their "Parkplatz".
- `contactRequests` -> Direct email/message leads received.

Call `GET /seller-api/sellers/{sellerId}/ads/{adId}/pricerating`:
- `rating`: `VERY_GOOD_PRICE`, `GOOD_PRICE`, `FAIR_PRICE`, `HIGH_PRICE`, `NO_RATING`.

---

## 7. Business Rules in ACAR

1. **Eligibility Gate**:
   - Vehicle must be in status `ready_for_sale` or `reserved`.
   - Dealership must have valid mobile.de credentials in Business Settings.
   - If not met, the "List on mobile.de" button remains gray/disabled with an informative tooltip/toast.
2. **Automatic Delisting**:
   - When a vehicle transitions to `sold` or is deleted in ACAR, send `DELETE /seller-api/sellers/{sellerId}/ads/{adId}` automatically so sold inventory is never left active online.
3. **Field Synchronization**:
   - Any modifications made in the listing modal (price, mileage, specs) synchronize immediately to the ACAR database upon publishing.
4. **Clean UI Isolation**:
   - Marketplace-specific attributes (Transmission, HU date, features list, EnVKV stats) do NOT clutter the general `VehicleForm.tsx`. They only appear inside `MobileDeListingModal.tsx`.
