package com.ordercare.refund.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.ordercare.refund.dto.ReturnItemDTO;
import com.ordercare.refund.dto.ReturnSubmissionDTO;
import com.ordercare.refund.entity.ReturnRequestEntity;
import com.ordercare.refund.repository.ReturnRequestRepository;
import io.camunda.zeebe.client.ZeebeClient;
import io.camunda.zeebe.client.api.response.ProcessInstanceEvent;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.*;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestTemplate;

import java.time.Instant;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;

@Service
public class CamundaOrchestrationService {

    public static final String PROCESS_ID = "Process_EcommerceReturn_PBL2";

    private final ZeebeClient zeebeClient;
    private final ReturnRequestRepository repository;
    private final ObjectMapper objectMapper = new ObjectMapper();
    private final RestTemplate restTemplate = new RestTemplate();

    // Short-lived cache to bridge 1-2s Camunda exporter lag right after task completion
    private final Map<String, Map<String, Object>> recentlyCompletedTasks = new ConcurrentHashMap<>();
    private final Map<String, Map<String, Object>> recentInstancesCache = new ConcurrentHashMap<>();

    @Value("${camunda.client.zeebe.rest-address:http://localhost:8080}")
    private String zeebeRestBase;

    public CamundaOrchestrationService(ZeebeClient zeebeClient, ReturnRequestRepository repository) {
        this.zeebeClient = zeebeClient;
        this.repository = repository;
    }

    public Map<String, Object> startReturnProcess(ReturnSubmissionDTO req) throws Exception {
        List<ReturnItemDTO> items = req.getReturnItems();
        if (items == null || items.isEmpty()) {
            ReturnItemDTO fallback = new ReturnItemDTO();
            fallback.setSku("SKU-001");
            fallback.setProductCategory(req.getProductCategory() != null ? req.getProductCategory() : "Electronics");
            fallback.setItemPrice(req.getItemPrice() != null ? req.getItemPrice() : 4500.0);
            items = List.of(fallback);
        }

        double totalPrice = items.stream()
                .mapToDouble(i -> i.getItemPrice() != null ? i.getItemPrice() : 0.0)
                .sum();
        String primaryCategory = items.get(0).getProductCategory() != null
                ? items.get(0).getProductCategory()
                : req.getProductCategory();

        Map<String, Object> variables = new HashMap<>();
        variables.put("productCategory", primaryCategory);
        variables.put("itemPrice", totalPrice);
        variables.put("daysSinceDelivery", req.getDaysSinceDelivery() != null ? req.getDaysSinceDelivery() : 5);
        variables.put("customerTier", req.getCustomerTier() != null ? req.getCustomerTier() : "Silver");
        variables.put("returnItems", items);

        ProcessInstanceEvent event = zeebeClient.newCreateInstanceCommand()
                .bpmnProcessId(PROCESS_ID)
                .latestVersion()
                .variables(variables)
                .send()
                .join();

        String pik = String.valueOf(event.getProcessInstanceKey());

        ReturnRequestEntity entity = new ReturnRequestEntity();
        entity.setProcessInstanceKey(pik);
        entity.setProductCategory(primaryCategory);
        entity.setItemPrice(totalPrice);
        entity.setDaysSinceDelivery(req.getDaysSinceDelivery());
        entity.setCustomerTier(req.getCustomerTier());
        entity.setItemCount(items.size());
        entity.setStatus("ACTIVE");
        entity.setItemsJson(objectMapper.writeValueAsString(items));
        repository.save(entity);

        Map<String, Object> cacheEntry = new HashMap<>();
        cacheEntry.put("processInstanceKey", pik);
        cacheEntry.put("processDefinitionId", PROCESS_ID);
        cacheEntry.put("state", "ACTIVE");
        cacheEntry.put("startDate", Instant.now().toString());
        cacheEntry.put("variables", variables);
        recentInstancesCache.put(pik, cacheEntry);

        return Map.of(
                "success", true,
                "processInstanceKey", pik,
                "processDefinitionId", PROCESS_ID,
                "itemCount", items.size(),
                "totalItemPrice", totalPrice,
                "timestamp", Instant.now().toString()
        );
    }

    @SuppressWarnings("unchecked")
    public Map<String, Object> queryZeebeSearch(String endpoint, Map<String, Object> filterBody) {
        try {
            HttpHeaders headers = new HttpHeaders();
            headers.setContentType(MediaType.APPLICATION_JSON);
            HttpEntity<Map<String, Object>> entity = new HttpEntity<>(filterBody, headers);
            ResponseEntity<Map> resp = restTemplate.postForEntity(zeebeRestBase + "/v2" + endpoint, entity, Map.class);
            return resp.getBody() != null ? resp.getBody() : Map.of();
        } catch (Exception e) {
            return Map.of("items", List.of(), "warning", e.getMessage());
        }
    }

    public void completeUserTask(String userTaskKey, Map<String, Object> variables) {
        cleanupCache();
        if (recentlyCompletedTasks.containsKey(userTaskKey)) {
            return;
        }

        String pik = null;
        try {
            @SuppressWarnings("unchecked")
            Map<String, Object> taskInfo = restTemplate.getForObject(zeebeRestBase + "/v2/user-tasks/" + userTaskKey, Map.class);
            if (taskInfo != null && taskInfo.get("processInstanceKey") != null) {
                pik = String.valueOf(taskInfo.get("processInstanceKey"));
            }
        } catch (Exception ignored) {}

        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_JSON);
        Map<String, Object> body = variables != null && !variables.isEmpty()
                ? Map.of("variables", variables)
                : Map.of();
        HttpEntity<Map<String, Object>> entity = new HttpEntity<>(body, headers);
        restTemplate.postForEntity(zeebeRestBase + "/v2/user-tasks/" + userTaskKey + "/completion", entity, Void.class);

        Map<String, Object> completedInfo = new HashMap<>();
        completedInfo.put("ts", System.currentTimeMillis());
        completedInfo.put("pik", pik);
        completedInfo.put("variables", variables != null ? variables : Map.of());
        recentlyCompletedTasks.put(userTaskKey, completedInfo);
    }

    public void assignUserTask(String userTaskKey, String assignee) {
        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_JSON);
        Map<String, Object> body = Map.of("assignee", assignee, "allowOverride", true);
        HttpEntity<Map<String, Object>> entity = new HttpEntity<>(body, headers);
        restTemplate.postForEntity(zeebeRestBase + "/v2/user-tasks/" + userTaskKey + "/assignment", entity, Void.class);
    }

    public void cleanupCache() {
        long now = System.currentTimeMillis();
        recentlyCompletedTasks.entrySet().removeIf(e -> now - (Long) e.getValue().get("ts") > 15000L);
    }

    public Map<String, Map<String, Object>> getRecentlyCompletedTasks() {
        cleanupCache();
        return recentlyCompletedTasks;
    }

    public Map<String, Map<String, Object>> getRecentInstancesCache() {
        return recentInstancesCache;
    }

    public List<ReturnRequestEntity> getAllPersistedRecords() {
        return repository.findAllByOrderByCreatedAtDesc();
    }
}
