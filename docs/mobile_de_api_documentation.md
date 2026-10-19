# mobile.de REST API — Complete Technical Reference & Documentation

> **Compiled from official documentation:** `https://services.mobile.de/manual/index.html`  
> **API Version:** REST API v1 / v2 (`application/vnd.de.mobile.api+json`)  
> **Scope:** Seller-API, Insights-API, Search-API, Lead-API, Reference Data

---

## 1. Architectural Overview & Environments

mobile.de provides a RESTful HTTP API allowing authorized car dealers and software partners to manage vehicle listings, images, leads, and performance statistics.

### Base URLs
| Environment | Base URL | Usage |
| :--- | :--- | :--- |
| **Sandbox (Test)** | `https://services-sandbox.mobile.de` | Testing ad insertions and API integrations without public visibility |
| **Production** | `https://services.mobile.de` | Live marketplace visible to millions of car buyers |

### Media Types & Headers
All requests and responses must use mobile.de-specific MIME types:
- **`Accept: application/vnd.de.mobile.api+json`** (or `application/vnd.de.mobile.api+xml`)
- **`Content-Type: application/vnd.de.mobile.api+json`**
- **`Accept-Language: de`** (or `en`)

---

## 2. Authentication & Authorization

mobile.de uses **HTTP Basic Authentication** over TLS/HTTPS.

### Headers:
```http
Authorization: Basic <base64(username:password)>
```

### Self-Uploading Dealers vs. Transfer Service Providers (TSPs)
1. **Self-Uploading Dealer (Our Dealership Model):**
   - A car dealership that manages its own inventory using internal custom software.
   - Has a single `mobileSellerId` assigned to their account.
   - Credentials (API Username + API Password) are issued directly to the dealership by mobile.de partner support.
   - All API endpoints follow: `/seller-api/sellers/{mobileSellerId}/...`
2. **Transfer Service Provider (TSP):**
   - Multi-tenant third-party dealer management systems (DMS) managing multiple distinct dealerships.

---

## 3. Core Seller-API Endpoints

### 3.1 Ad Lifecycle Management (Cars)

| Operation | HTTP Method | Endpoint Path | Description |
| :--- | :--- | :--- | :--- |
| **Create Ad** | `POST` | `/seller-api/sellers/{sellerId}/ads` | Insert a new car listing |
| **Get Ad** | `GET` | `/seller-api/sellers/{sellerId}/ads/{adId}` | Retrieve full details of an existing listing |
| **Update Ad** | `PUT` | `/seller-api/sellers/{sellerId}/ads/{adId}` | Full update of an existing ad |
| **Delete Ad** | `DELETE` | `/seller-api/sellers/{sellerId}/ads/{adId}` | Remove / unpublish listing |
| **List Ads** | `GET` | `/seller-api/sellers/{sellerId}/ads` | Paginated list of all active/paused ads |

#### Ad Creation Header Rule:
When creating an ad (`POST`), you should supply:
```http
X-Mobile-Insertion-Request-Id: <uuid-or-unique-string>
```
If network timeouts or retries occur, mobile.de guarantees idempotency and will not create duplicate listings.

#### Response on Successful Creation:
- Status: `201 Created`
- Header: `Location: https://services.mobile.de/seller-api/sellers/{sellerId}/ads/{adId}`
- Body: Contains the created ad representation including `adId` and public listing URL.

---

### 3.2 Image Upload & Attachment

Images cannot be sent inline as raw binary inside the Ad JSON. Instead, mobile.de follows a 2-step process:

1. **Upload Binary Image:**
   - **Method:** `POST`
   - **Endpoint:** `/seller-api/sellers/{sellerId}/images`
   - **Headers:** `Content-Type: image/jpeg` or `image/png`
   - **Body:** Raw binary bytes of the photo
   - **Response (`201 Created`):**
     ```http
     Location: https://services.mobile.de/seller-api/sellers/{sellerId}/images/{imageId}
     ```
2. **Attach Image Reference to Ad Payload:**
   Inside the `ad` payload JSON:
   ```json
   "images": [
     {
       "ref": "https://services.mobile.de/seller-api/sellers/{sellerId}/images/{imageId}"
     }
   ]
   ```

---

## 4. Complete Expected JSON Structure (`Car` Listing)

Below is the standard JSON structure expected by `POST /seller-api/sellers/{sellerId}/ads`:

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
        "nonSmokerVehicle": true,
        "hu": "2025-08"
      },
      "features": [
        "ABS",
        "ALLOY_WHEELS",
        "BLUETOOTH",
        "CRUISE_CONTROL",
        "ELECTRIC_HEATED_SEATS",
        "FOUR_WHEEL_DRIVE",
        "IMMOBILIZER",
        "ISOFIX",
        "LEATHER_STEERING_WHEEL",
        "MULTIFUNCTIONAL_WHEEL",
        "NAVIGATION_SYSTEM",
        "PARKING_SENSORS",
        "RAIN_SENSOR",
        "START_STOP_SYSTEM",
        "TRACTION_CONTROL_SYSTEM",
        "XENON_HEADLIGHTS"
      ],
      "environment": {
        "emissionClass": "EURO6",
        "emissionClassDe": "EURO6",
        "emissionBadge": "GREEN",
        "fuelConsumption": {
          "combined": 5.2,
          "urban": 5.9,
          "extraUrban": 4.7,
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
    "description": "Very clean, accident-free Audi A4 Avant S-Line. Full Audi service record, fresh inspection. Financing and trade-in available.",
    "contact": {
      "name": "Autohaus Muster GmbH",
      "phone": "+49 123 4567890",
      "city": "Berlin",
      "postalCode": "10115",
      "country": "DE"
    },
    "images": [
      {
        "ref": "https://services.mobile.de/seller-api/sellers/12345/images/987654321"
      }
    ],
    "customProperties": {
      "internalId": "DB-1042"
    }
  }
}
```

---

## 5. Insights-API & Statistics

mobile.de provides rich programmatic analytics for every listed vehicle.

### 5.1 Listing Statistics Endpoint
- **Method:** `GET`
- **Endpoint:** `/seller-api/sellers/{sellerId}/ads/{adId}/statistics`
- **Returned Metrics:**
  - `detailViews`: Number of users who clicked and viewed the full listing page.
  - `searchHits`: Number of times the car showed up in search result lists.
  - `parkings`: Number of times prospective buyers bookmarked/favorited the vehicle in their mobile.de parking lot ("Parkplatz").
  - `contactRequests` / `leads`: Number of email/message inquiries submitted through the listing.

### 5.2 Price Rating ("Preisbewertung") Endpoint
- **Method:** `GET`
- **Endpoint:** `/seller-api/sellers/{sellerId}/ads/{adId}/pricerating`
- **Returned Data:**
  - Rating: `VERY_GOOD_PRICE`, `GOOD_PRICE`, `FAIR_PRICE`, `HIGH_PRICE`, or `NO_RATING`.
  - Market delta and price corridor compared to similar vehicles currently listed on mobile.de.

---

## 6. Lead-API

Dealers can retrieve buyer inquiries without having to manually log into the mobile.de back-office:
- **Method:** `GET`
- **Endpoint:** `/seller-api/sellers/{sellerId}/leads`
- **Filter Query Parameters:**
  - `adId={adId}`: Retrieve leads specifically for one vehicle.
  - `from={timestamp}` / `to={timestamp}`: Time-filtered retrieval.
- **Payload Contents:**
  - Customer contact details (Name, Email, Phone number).
  - Customer message text.
  - Optional trade-in offer vehicle data submitted by the customer.

---

## 7. Reference Data API

mobile.de provides standardized taxonomies that must be followed for dropdowns and enum values:
- `GET /seller-api/reference-data/classes`: Vehicle classes (`Car`, `Motorbike`, `Truck`, `Van`, etc.).
- `GET /seller-api/reference-data/categories?class=Car`: Body types (`Limousine`, `EstateCar`, `Cabriolet`, `SUV`, etc.).
- `GET /seller-api/reference-data/makes?class=Car`: List of valid manufacturers.
- `GET /seller-api/reference-data/models?make={makeId}`: List of valid models for a given make.
- `GET /seller-api/reference-data/features?class=Car`: Complete dictionary of all official equipment tags (`NAVIGATION_SYSTEM`, `XENON_HEADLIGHTS`, `HEATED_SEATS`, etc.).
- `GET /seller-api/reference-data/fuel-types`: Supported fuel codes (`PETROL`, `DIESEL`, `ELECTRIC`, `HYBRID`, `LPG`, `CNG`, etc.).
- `GET /seller-api/reference-data/colors`: Standard exterior colors.
