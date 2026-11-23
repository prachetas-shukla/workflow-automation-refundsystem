# OrderCare Return Automation

OrderCare is a Camunda 8 return-and-refund automation solution. A React operations console submits return requests to a Spring Boot API, which starts `Process_EcommerceReturn_PBL2` in Zeebe. The process verifies each line item in a parallel multi-instance task, evaluates return policy in DMN, routes the request through inspection or instant refund, updates the order, and dispatches a reusable customer notification.

The Part 3 console is intentionally live-only: it does not seed or fabricate workflow, tasklist, health, or H2 data. The UI reads those values from the backend endpoints described below.

## Project Overview

- Start a return with one or many `returnItems`.
- Evaluate `Decision_ReturnPolicy_PBL2` using delivery age, category, total price, and customer tier.
- Route to rejection, warehouse inspection, or instant refund.
- Exercise the payment boundary error with an amount over `₹5,00,000`.
- Monitor live Zeebe health, element state, process variables, custom user tasks, and persisted H2 records.

## Folder Structure

```text
.
├── backend-springboot/
│   ├── src/main/java/com/ordercare/refund/
│   │   ├── controller/      REST API endpoints
│   │   ├── dto/              Return request payloads
│   │   ├── entity/           H2/JPA persistence model
│   │   ├── service/          Zeebe and Operate REST orchestration
│   │   └── worker/           Fetch-order and payment workers
│   ├── src/main/resources/application.yml
│   ├── Dockerfile
│   └── mvnw.cmd
├── bpmn-models/
│   ├── PBL2_Ecommerce_Return_BPMNnew.bpmn
│   ├── PBL2_Ecommerce_Return_DMNnew.dmn
│   ├── child-notification-process.bpmn
│   └── warehouse-inspection.form
├── frontend-react/
│   ├── src/App.jsx           Live operations console
│   ├── src/index.css         Tailwind base and corporate component styles
│   ├── Dockerfile            Vite build served by nginx
│   └── package.json
├── docker-compose.yml
└── README.md
```

## Setup & Run

### Prerequisites

- Java 21
- Docker Desktop with Compose v2, if using containers
- Node.js 18+ and npm, if running the frontend locally
- A reachable Camunda 8.6+ Zeebe gateway and Operate-compatible REST API

The backend is configured for plaintext self-managed Zeebe by default. Change the addresses for a remote cluster or provide them through environment variables.

### Start the backend locally

```powershell
cd backend-springboot
.\mvnw.cmd clean compile
.\mvnw.cmd spring-boot:run
```

The API listens on `http://localhost:5000`. H2 persists to `backend-springboot/data/ordercaredb` when the application is run from that directory. The H2 console is available at `http://localhost:5000/h2-console` with JDBC URL `jdbc:h2:file:./data/ordercaredb`, user `sa`, and an empty password.

Set these values before starting the backend when the gateway is not local:

```powershell
$env:ZEEBE_GRPC_ADDRESS = "http://localhost:26500"
$env:ZEEBE_REST_ADDRESS = "http://localhost:8080"
```

Deploy the process resources from `bpmn-models/` to the same Zeebe cluster before submitting requests. Deploy `PBL2_Ecommerce_Return_BPMNnew.bpmn`, `PBL2_Ecommerce_Return_DMNnew.dmn`, `child-notification-process.bpmn`, and `warehouse-inspection.form` using your Camunda 8 deployment workflow.

### Start the frontend locally

```powershell
cd frontend-react
npm install
npm run dev
```

Open `http://localhost:5173`. The default API base is `http://localhost:5000/api`; override it at build or dev time with `VITE_API_BASE_URL` when the backend is hosted elsewhere:

```powershell
$env:VITE_API_BASE_URL = "http://localhost:5000/api"
npm run dev
```

### Start both services with Docker Compose

```powershell
docker compose up --build
```

The frontend is at `http://localhost:5173` and the backend is at `http://localhost:5000`. Compose defaults Zeebe addresses to `host.docker.internal`, which allows containers to reach a gateway running on the host. Set `ZEEBE_GRPC_ADDRESS` and `ZEEBE_REST_ADDRESS` in a `.env` file or in the shell for a gateway running elsewhere:

```text
ZEEBE_GRPC_ADDRESS=http://host.docker.internal:26500
ZEEBE_REST_ADDRESS=http://host.docker.internal:8080
```

The Compose volume `ordercare-h2-data` keeps backend records across container restarts.

## Frontend Operations

The console provides five quick-fill payloads aligned to the DMN rules:

| Scenario | Payload | Expected route |
| --- | --- | --- |
| Electronics warehouse inspection | Electronics, `₹4,500`, 5 days, Silver | `Warehouse-Inspection`, 5% fee |
| Laptop + apparel multi-item | Electronics laptop plus Apparel line item | Parallel `Task_FetchOrder` loop |
| Gold fast-track | Accessories, `₹450`, 3 days, Gold | `Instant-Refund`, 0% fee |
| Expired window | Home, `₹3,000`, 20 days, Regular | `Reject` |
| Gateway boundary | Electronics, `₹6,00,000`, 4 days, Regular | `ERR_PAYMENT_GATEWAY` boundary |

The line-item builder sends `sku`, `productCategory`, and `itemPrice` in `returnItems[]`. The tasklist buttons claim a task as `demo` and complete it with `variables.inspectionPassed` set to `true` or `false`. The workflow SVG colors completed elements green and active elements amber using `GET /api/returns/status/{processInstanceKey}`.

## Technology Stack

- Camunda 8.6.9 Spring SDK, Zeebe, Operate search REST APIs, BPMN, and DMN
- Spring Boot 3.3.4, Java 21, Spring Web, Spring Data JPA, H2
- React 18, Vite 5, Tailwind CSS 3, Lucide React
- Docker multi-stage builds, nginx, and Docker Compose

## System Architecture

```text
Browser :5173
   │
   │ HTTP /api
   ▼
Spring Boot :5000 ───── Zeebe gRPC ───── Camunda 8 Gateway
   │                         │
   │ Operate REST :8080      └─ BPMN process, DMN, user tasks, workers
   ▼
H2 database
```

`POST /api/returns/submit` starts the process with the request variables and persists an initial record. `GET /api/health` probes the Zeebe topology. Status, tasklist, and variable queries use the configured Zeebe REST base. The two workers update H2 as order verification and payment disbursement progress. The payment worker raises `ERR_PAYMENT_GATEWAY` for amounts above `500000.0`, which is caught by `Boundary_PaymentError` in the BPMN model.

## REST API Used by the Console

| Method | Endpoint | Purpose |
| --- | --- | --- |
| `GET` | `/api/health` | Zeebe topology health indicator |
| `POST` | `/api/returns/submit` | Start a return process |
| `GET` | `/api/returns/status/{pik}` | Variables, stepper, active/completed element IDs, pending tasks |
| `GET` | `/api/tasks` | Open custom user tasks |
| `POST` | `/api/tasks/assign` | Assign a task, normally to `demo` |
| `POST` | `/api/tasks/complete` | Complete a task with `variables.inspectionPassed` |
| `GET` | `/api/db/records` | Persisted H2 return records |

Example submission:

```json
{
  "productCategory": "Electronics",
  "itemPrice": 87500,
  "daysSinceDelivery": 7,
  "customerTier": "Silver",
  "returnItems": [
    { "sku": "SKU-LAPTOP-01", "productCategory": "Electronics", "itemPrice": 85000 },
    { "sku": "SKU-APPAREL-01", "productCategory": "Apparel", "itemPrice": 2500 }
  ]
}
```

## FEEL Expression Dictionary

The following dictionary covers every FEEL expression and FEEL literal used by `PBL2_Ecommerce_Return_BPMNnew.bpmn`, `child-notification-process.bpmn`, and `PBL2_Ecommerce_Return_DMNnew.dmn`.

### Process start and multi-instance fetch

| Location | Expression | Meaning |
| --- | --- | --- |
| `Start_ReturnRequest` output | `if is defined(returnItems) and count(returnItems) > 0 then returnItems else [{"sku": "SKU-DEFAULT-01", "productCategory": productCategory, "itemPrice": itemPrice}]` | Preserve a submitted item array, or create one default line item. |
| `Start_ReturnRequest` output | `productCategory` | Copies the primary category into the process scope. |
| `Start_ReturnRequest` output | `itemPrice` | Copies the total item price into the process scope. |
| `Start_ReturnRequest` output | `daysSinceDelivery` | Copies delivery age for the DMN input. |
| `Start_ReturnRequest` output | `customerTier` | Copies trust tier for the DMN input. |
| `Task_FetchOrder` input | `currentItem.productCategory` | Maps the current multi-instance line category to the worker variable `itemCategory`. |
| `Task_FetchOrder` input | `currentItem.itemPrice` | Maps the current line price to `lineItemPrice`. |
| `Task_FetchOrder` output | `orderStatus` | Maps the worker result back to each loop item. |
| `Task_FetchOrder` loop | `returnItemsList` | Input collection for the parallel multi-instance task. |
| `Task_FetchOrder` loop | `currentItem` | Name of the current collection element. |
| `Task_FetchOrder` loop | `verifiedItemsList` | Output collection containing each `orderStatus` result. |

### DMN inputs and rules

| DMN element | FEEL | Meaning |
| --- | --- | --- |
| `InputExpr_Days` | `daysSinceDelivery` | Number of days since delivery. |
| `InputExpr_Category` | `productCategory` | Category evaluated by the policy table. |
| `InputExpr_Price` | `itemPrice` | Total item price used by price thresholds. |
| `InputExpr_Trust` | `customerTier` | Customer trust tier. |
| Rule 1 days | `> 14` | Reject returns outside the general 14-day window. |
| Rule 1 other inputs | `-` | Any value; the dash is the DMN wildcard unary test. |
| Rule 1 outputs | `"Reject"`, `0` | Reject with no restocking fee. |
| Rule 2 category | `"Digital", "PersonalCare"` | Reject digital and personal-care items. |
| Rule 2 other inputs | `-` | Any value for the remaining columns. |
| Rule 2 outputs | `"Reject"`, `0` | Reject with no restocking fee. |
| Rule 3 days | `<= 14` | Item is within the return window. |
| Rule 3 price | `<= 500` | Low-value item threshold. |
| Rule 3 tier | `"Gold", "Platinum"` | Trusted customers qualify for instant refund. |
| Rule 3 category | `-` | Any category. |
| Rule 3 outputs | `"Instant-Refund"`, `0` | Refund immediately with no fee. |
| Rule 4 days | `<= 14` | Item is within the return window. |
| Rule 4 category | `"Electronics"` | Electronics require inspection. |
| Rule 4 price, tier | `-` | Any price or tier. |
| Rule 4 outputs | `"Warehouse-Inspection"`, `5` | Inspect and charge a 5% fee. |
| Rule 5 days | `<= 14` | Item is within the return window. |
| Rule 5 category | `"Apparel", "Footwear"` | Apparel and footwear require inspection. |
| Rule 5 price, tier | `-` | Any price or tier. |
| Rule 5 outputs | `"Warehouse-Inspection"`, `0` | Inspect with no fee. |
| Rule 6 inputs | `-` in every column | Default warehouse-inspection route. |
| Rule 6 outputs | `"Warehouse-Inspection"`, `0` | Inspect with no fee. |

### DMN output mapping and gateways

| Location | Expression | Meaning |
| --- | --- | --- |
| `Task_EvaluateDMN` output | `refundDecision` | Stores the complete decision result. |
| `Task_EvaluateDMN` output | `refundDecision.restockingFee` | Promotes the fee percentage to `restockingFee`. |
| `Task_EvaluateDMN` output | `refundDecision.refundAction` | Promotes the route to `policyDecision`. |
| `Flow_Route_Reject` | `refundDecision.refundAction = "Reject"` | Routes to `End_ReturnRejected`. |
| `Flow_Route_Instant` | `refundDecision.refundAction = "Instant-Refund"` | Routes directly to payment disbursement. |
| `Flow_Inspect_Passed` | `inspectionPassed = true` | Sends a passed warehouse inspection to payment. |
| `Boundary_TimerSLA` | `PT24H` | Timer duration; escalates after 24 hours. |

### ERP connector and customer notification

| Location | Expression | Meaning |
| --- | --- | --- |
| `Task_UpdateERP` | `false` | Disable response storage, redirect following, and null ignoring where used by the connector. |
| `Task_UpdateERP` | `20` | Connection and read timeout in seconds. |
| `Task_UpdateERP` body | `{ "orderStatus": "CLOSED", "inventoryAction": "RESTOCKED", "paymentStatus": "SUCCESS" }` | JSON payload sent to the HTTP connector. |
| `Call_NotifyCustomer` input | `customerTier` | Maps the tier to the child process recipient. |
| `Call_NotifyCustomer` input | `"REFUND_SETTLED"` | Notification type. |
| `Call_NotifyCustomer` input | `"Your refund has been processed and order closed."` | Notification message. |
| `Call_NotifyCustomer` input | `netRefundAmount` | Amount sent to the notification child process. |
| `Call_NotifyCustomer` output | `notificationDispatched` | Promotes the child process delivery result. |

The child notification process uses the same connector expression conventions: `false` for `storeResponse`, `followRedirects`, and `ignoreNullValues`; `20` for both timeout fields; and the object expression `{ "notificationChannel": "ORDERCARE_ALERT", "recipientTier": recipientTier, "notificationType": notificationType, "notificationMessage": notificationMessage, "refundAmount": refundAmount }` for its webhook body. Its result expression is `{ notificationDispatched: true, notificationAckStatus: "DELIVERED_200_OK" }`.

## Verification

The requested backend compilation check passes with zero compilation errors:

```text
backend-springboot> .\mvnw.cmd clean compile
BUILD SUCCESS
```

For the frontend build:

```powershell
cd frontend-react
npm install
npm run build
```
