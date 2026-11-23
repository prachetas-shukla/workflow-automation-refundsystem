package com.ordercare.refund.controller;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.ordercare.refund.dto.ReturnSubmissionDTO;
import com.ordercare.refund.entity.ReturnRequestEntity;
import com.ordercare.refund.service.CamundaOrchestrationService;
import io.camunda.zeebe.client.ZeebeClient;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.time.Instant;
import java.util.*;

@RestController
@RequestMapping("/api")
@CrossOrigin(origins = "*")
public class ReturnController {

    private final CamundaOrchestrationService service;
    private final ZeebeClient zeebeClient;
    private final ObjectMapper objectMapper = new ObjectMapper();

    public ReturnController(CamundaOrchestrationService service, ZeebeClient zeebeClient) {
        this.service = service;
        this.zeebeClient = zeebeClient;
    }

    @GetMapping("/health")
    public ResponseEntity<Map<String, Object>> health() {
        try {
            var topology = zeebeClient.newTopologyRequest().send().join();
            return ResponseEntity.ok(Map.of(
                    "status", "connected",
                    "engine", "Camunda 8 Zeebe (Spring Boot)",
                    "version", topology.getGatewayVersion(),
                    "timestamp", Instant.now().toString()
            ));
        } catch (Exception e) {
            return ResponseEntity.ok(Map.of(
                    "status", "disconnected",
                    "error", e.getMessage(),
                    "timestamp", Instant.now().toString()
            ));
        }
    }

    @PostMapping("/returns/submit")
    public ResponseEntity<?> submitReturn(@RequestBody ReturnSubmissionDTO req) {
        try {
            return ResponseEntity.ok(service.startReturnProcess(req));
        } catch (Exception e) {
            return ResponseEntity.status(502).body(Map.of("detail", Map.of("error", e.getMessage())));
        }
    }

    @GetMapping("/instances")
    @SuppressWarnings("unchecked")
    public ResponseEntity<Map<String, Object>> listInstances() {
        Map<String, Object> searchRes = service.queryZeebeSearch("/process-instances/search",
                Map.of("filter", Map.of("processDefinitionId", CamundaOrchestrationService.PROCESS_ID)));
        List<Map<String, Object>> items = (List<Map<String, Object>>) searchRes.getOrDefault("items", List.of());

        Map<String, Map<String, Object>> instancesMap = new LinkedHashMap<>();
        for (var entry : service.getRecentInstancesCache().entrySet()) {
            instancesMap.put(entry.getKey(), new HashMap<>(entry.getValue()));
        }

        for (Map<String, Object> item : items) {
            String pik = String.valueOf(item.getOrDefault("processInstanceKey", item.getOrDefault("key", "")));
            String state = String.valueOf(item.getOrDefault("state", "ACTIVE")).toUpperCase();
            instancesMap.put(pik, Map.of(
                    "processInstanceKey", pik,
                    "processDefinitionId", CamundaOrchestrationService.PROCESS_ID,
                    "state", state,
                    "startDate", String.valueOf(item.getOrDefault("startDate", ""))
            ));
        }

        List<Map<String, Object>> sorted = new ArrayList<>(instancesMap.values());
        sorted.sort((a, b) -> String.valueOf(b.get("processInstanceKey")).compareTo(String.valueOf(a.get("processInstanceKey"))));

        return ResponseEntity.ok(Map.of("instances", sorted, "count", sorted.size(), "timestamp", Instant.now().toString()));
    }

    @GetMapping("/returns/status/{pik}")
    @SuppressWarnings("unchecked")
    public ResponseEntity<Map<String, Object>> getStatus(@PathVariable String pik) {
        Map<String, Object> varRes = service.queryZeebeSearch("/variables/search",
                Map.of("filter", Map.of("processInstanceKey", pik)));
        List<Map<String, Object>> varItems = (List<Map<String, Object>>) varRes.getOrDefault("items", List.of());
        Map<String, Object> variables = new LinkedHashMap<>();
        for (Map<String, Object> vi : varItems) {
            String name = (String) vi.get("name");
            Object val = vi.get("value");
            if (name != null) {
                if (val instanceof String strVal) {
                    try { variables.put(name, objectMapper.readValue(strVal, Object.class)); }
                    catch (Exception ex) { variables.put(name, strVal); }
                } else {
                    variables.put(name, val);
                }
            }
        }

        if (variables.isEmpty() && service.getRecentInstancesCache().containsKey(pik)) {
            Map<String, Object> cachedVars = (Map<String, Object>) service.getRecentInstancesCache().get(pik).get("variables");
            if (cachedVars != null) variables.putAll(cachedVars);
        }

        boolean justCompletedForPik = false;
        for (Map<String, Object> cInfo : service.getRecentlyCompletedTasks().values()) {
            if (pik.equals(cInfo.get("pik"))) {
                justCompletedForPik = true;
                Map<String, Object> cVars = (Map<String, Object>) cInfo.get("variables");
                if (cVars != null) variables.putAll(cVars);
            }
        }

        Map<String, Object> elRes = service.queryZeebeSearch("/element-instances/search",
                Map.of("filter", Map.of("processInstanceKey", pik)));
        List<Map<String, Object>> elements = (List<Map<String, Object>>) elRes.getOrDefault("items", List.of());
        Set<String> completedNodes = new TreeSet<>();
        Set<String> activeNodes = new TreeSet<>();
        for (Map<String, Object> el : elements) {
            String eid = String.valueOf(el.getOrDefault("elementId", ""));
            String st = String.valueOf(el.getOrDefault("state", "")).toUpperCase();
            if ("COMPLETED".equals(st)) completedNodes.add(eid);
            else if ("ACTIVE".equals(st)) activeNodes.add(eid);
        }
        activeNodes.removeAll(completedNodes);

        if (justCompletedForPik && activeNodes.contains("Task_WarehouseInspect")) {
            activeNodes.remove("Task_WarehouseInspect");
            completedNodes.add("Task_WarehouseInspect");
        }

        Map<String, Object> taskRes = service.queryZeebeSearch("/user-tasks/search",
                Map.of("filter", Map.of("processInstanceKey", pik)));
        List<Map<String, Object>> allTasks = (List<Map<String, Object>>) taskRes.getOrDefault("items", List.of());
        List<Map<String, Object>> pendingTasks = new ArrayList<>();
        for (Map<String, Object> t : allTasks) {
            String tk = String.valueOf(t.getOrDefault("userTaskKey", t.getOrDefault("key", "")));
            if ("CREATED".equalsIgnoreCase(String.valueOf(t.get("state"))) && !service.getRecentlyCompletedTasks().containsKey(tk)) {
                pendingTasks.add(Map.of(
                        "userTaskKey", tk,
                        "name", String.valueOf(t.getOrDefault("name", "Warehouse Item Quality Inspection")),
                        "assignee", String.valueOf(t.getOrDefault("assignee", "demo")),
                        "state", "CREATED",
                        "processInstanceKey", pik
                ));
            }
        }

        Object rdObj = variables.get("refundDecision");
        String policyDecision = variables.get("policyDecision") != null ? String.valueOf(variables.get("policyDecision")) : null;
        Object restockingFee = variables.get("restockingFee");
        if (rdObj instanceof Map<?, ?> rdMap) {
            if (rdMap.get("refundAction") != null) policyDecision = rdMap.get("refundAction").toString();
            if (rdMap.get("restockingFee") != null) restockingFee = rdMap.get("restockingFee");
        }

        boolean isCompletedEnd = completedNodes.contains("End_RefundCompleted");
        boolean isRejectedEnd = completedNodes.contains("End_ReturnRejected");
        String instanceState = (isCompletedEnd || isRejectedEnd) ? "COMPLETED" : "ACTIVE";

        boolean orderVerified = completedNodes.contains("Task_FetchOrder") || "VERIFIED".equals(variables.get("orderStatus"));
        boolean dmnEvaluated = completedNodes.contains("Task_EvaluateDMN") || rdObj != null;
        boolean warehousePending = (activeNodes.contains("Task_WarehouseInspect") || !pendingTasks.isEmpty()) && !justCompletedForPik;
        boolean warehouseDone = completedNodes.contains("Task_WarehouseInspect") || variables.containsKey("inspectionPassed");
        boolean refundDisbursed = completedNodes.contains("Task_DisburseRefund") || "DISBURSED".equals(variables.get("refundStatus"));
        boolean erpUpdated = completedNodes.contains("Task_UpdateERP") || variables.containsKey("inventorySyncResponse");
        boolean callActivityDone = completedNodes.contains("Call_NotifyCustomer") || Boolean.TRUE.equals(variables.get("notificationDispatched"));

        if (orderVerified || activeNodes.contains("Task_FetchOrder")) completedNodes.add("Start_ReturnRequest");
        if (dmnEvaluated && (warehousePending || warehouseDone || refundDisbursed || isRejectedEnd)) completedNodes.add("Gateway_Routing");
        if (warehouseDone && (refundDisbursed || isRejectedEnd)) completedNodes.add("Gateway_InspectionCheck");

        Map<String, Object> stepper = new LinkedHashMap<>();
        stepper.put("orderVerified", orderVerified);
        stepper.put("dmnEvaluated", dmnEvaluated);
        stepper.put("policyDecision", policyDecision);
        stepper.put("restockingFee", restockingFee);
        stepper.put("warehouseInspectionPending", warehousePending);
        stepper.put("warehouseInspectionDone", warehouseDone);
        stepper.put("refundDisbursed", refundDisbursed);
        stepper.put("erpUpdated", erpUpdated);
        stepper.put("callActivityDone", callActivityDone);
        stepper.put("rejected", isRejectedEnd || ("Reject".equals(policyDecision) && dmnEvaluated) || (Boolean.FALSE.equals(variables.get("inspectionPassed")) && warehouseDone));
        stepper.put("completed", isCompletedEnd || callActivityDone);

        return ResponseEntity.ok(Map.of(
                "processInstanceKey", pik,
                "instanceState", instanceState,
                "variables", variables,
                "stepper", stepper,
                "pendingUserTasks", pendingTasks,
                "completedNodes", completedNodes,
                "activeNodes", activeNodes,
                "timestamp", Instant.now().toString()
        ));
    }

    @GetMapping("/tasks")
    @SuppressWarnings("unchecked")
    public ResponseEntity<Map<String, Object>> listOpenTasks() {
        Map<String, Object> taskRes = service.queryZeebeSearch("/user-tasks/search",
                Map.of("filter", Map.of("state", "CREATED")));
        List<Map<String, Object>> items = (List<Map<String, Object>>) taskRes.getOrDefault("items", List.of());
        List<Map<String, Object>> enriched = new ArrayList<>();
        for (Map<String, Object> t : items) {
            String tk = String.valueOf(t.getOrDefault("userTaskKey", t.getOrDefault("key", "")));
            if (service.getRecentlyCompletedTasks().containsKey(tk)) continue;
            String pik = String.valueOf(t.getOrDefault("processInstanceKey", ""));
            enriched.add(Map.of(
                    "userTaskKey", tk,
                    "name", String.valueOf(t.getOrDefault("name", "Warehouse Item Quality Inspection")),
                    "assignee", String.valueOf(t.getOrDefault("assignee", "demo")),
                    "state", "CREATED",
                    "processInstanceKey", pik
            ));
        }
        return ResponseEntity.ok(Map.of("tasks", enriched, "count", enriched.size(), "timestamp", Instant.now().toString()));
    }

    @PostMapping("/tasks/complete")
    @SuppressWarnings("unchecked")
    public ResponseEntity<?> completeTask(@RequestBody Map<String, Object> body) {
        try {
            String userTaskKey = String.valueOf(body.get("userTaskKey"));
            Map<String, Object> vars = (Map<String, Object>) body.getOrDefault("variables", Map.of());
            service.completeUserTask(userTaskKey, vars);
            return ResponseEntity.ok(Map.of("success", true, "userTaskKey", userTaskKey));
        } catch (Exception e) {
            return ResponseEntity.status(502).body(Map.of("detail", Map.of("error", e.getMessage())));
        }
    }

    @PostMapping("/tasks/assign")
    public ResponseEntity<?> assignTask(@RequestBody Map<String, Object> body) {
        try {
            String userTaskKey = String.valueOf(body.get("userTaskKey"));
            String assignee = String.valueOf(body.getOrDefault("assignee", "demo"));
            service.assignUserTask(userTaskKey, assignee);
            return ResponseEntity.ok(Map.of("success", true, "userTaskKey", userTaskKey, "assignee", assignee));
        } catch (Exception e) {
            return ResponseEntity.status(502).body(Map.of("detail", Map.of("error", e.getMessage())));
        }
    }

    @GetMapping("/db/records")
    public ResponseEntity<List<ReturnRequestEntity>> getDatabaseRecords() {
        return ResponseEntity.ok(service.getAllPersistedRecords());
    }
}
