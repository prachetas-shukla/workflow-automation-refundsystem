package com.ordercare.refund.worker;

import com.ordercare.refund.repository.ReturnRequestRepository;
import io.camunda.zeebe.client.api.response.ActivatedJob;
import io.camunda.zeebe.spring.client.annotation.JobWorker;
import io.camunda.zeebe.spring.client.annotation.Variable;
import io.camunda.zeebe.spring.common.exception.ZeebeBpmnError;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import java.time.LocalDateTime;
import java.util.HashMap;
import java.util.Map;
import java.util.UUID;

@Component
public class RefundJobWorkers {

    private static final Logger log = LoggerFactory.getLogger(RefundJobWorkers.class);
    private final ReturnRequestRepository repository;

    public RefundJobWorkers(ReturnRequestRepository repository) {
        this.repository = repository;
    }

    @JobWorker(type = "fetch-order-service", autoComplete = true)
    public Map<String, Object> fetchOrderDetails(
            ActivatedJob job,
            @Variable(name = "itemCategory") String itemCategory,
            @Variable(name = "lineItemPrice") Double lineItemPrice,
            @Variable(name = "productCategory") String productCategory,
            @Variable(name = "itemPrice") Double itemPrice) {

        String pik = String.valueOf(job.getProcessInstanceKey());
        String cat = itemCategory != null ? itemCategory : productCategory;
        Double price = lineItemPrice != null ? lineItemPrice : itemPrice;

        log.info("--- [STEP 1: FETCH ORDER DETAILS WORKER (Multi-Instance)] ---");
        log.info("Instance Key : {} | Category : {} | Line Price : ₹{}", pik, cat, price);

        repository.findByProcessInstanceKey(pik).ifPresent(entity -> {
            entity.setStatus("VERIFIED");
            entity.setUpdatedAt(LocalDateTime.now());
            repository.save(entity);
        });

        Map<String, Object> output = new HashMap<>();
        output.put("orderStatus", "VERIFIED");
        return output;
    }

    @JobWorker(type = "payment-disbursement-worker", autoComplete = true)
    public Map<String, Object> disburseRefund(
            ActivatedJob job,
            @Variable(name = "itemPrice") Double itemPrice,
            @Variable(name = "customerTier") String customerTier,
            @Variable(name = "restockingFee") Double restockingFee,
            @Variable(name = "refundDecision") Map<String, Object> refundDecision) {

        String pik = String.valueOf(job.getProcessInstanceKey());
        double price = itemPrice != null ? itemPrice : 0.0;

        // Business Exception Trigger: Amounts above ₹5,00,000 exceed automated payment gateway cap
        if (price > 500000.0) {
            log.warn("[BUSINESS ERROR] Payment cap exceeded (₹{}) for instance {}. Throwing ERR_PAYMENT_GATEWAY.", price, pik);
            repository.findByProcessInstanceKey(pik).ifPresent(entity -> {
                entity.setStatus("REJECTED_GATEWAY_LIMIT");
                entity.setUpdatedAt(LocalDateTime.now());
                repository.save(entity);
            });
            throw new ZeebeBpmnError("ERR_PAYMENT_GATEWAY", "Automated gateway refund limit of ₹5,00,000 exceeded.", Map.of());
        }

        double feePercent = restockingFee != null ? restockingFee : 0.0;
        String action = "Approved";
        if (refundDecision != null) {
            Object feeObj = refundDecision.get("restockingFee");
            if (feeObj instanceof Number num) {
                feePercent = num.doubleValue();
            }
            if (refundDecision.get("refundAction") != null) {
                action = refundDecision.get("refundAction").toString();
            }
        }

        double feeAmount = (price * feePercent) / 100.0;
        double netRefund = price - feeAmount;
        String txnId = "TXN_SB_" + UUID.randomUUID().toString().substring(0, 8).toUpperCase();

        log.info("--- [STEP 2: PAYMENT DISBURSEMENT WORKER] ---");
        log.info("Instance: {} | Tier: {} | Gross: ₹{} | Fee: {}% (-₹{}) | Net Sent: ₹{} | Txn: {}",
                pik, customerTier, price, feePercent, feeAmount, netRefund, txnId);

        final double finalFee = feePercent;
        final String finalAction = action;
        repository.findByProcessInstanceKey(pik).ifPresent(entity -> {
            entity.setPolicyDecision(finalAction);
            entity.setRestockingFee(finalFee);
            entity.setNetRefundAmount(netRefund);
            entity.setPaymentTransactionId(txnId);
            entity.setStatus("COMPLETED");
            entity.setUpdatedAt(LocalDateTime.now());
            repository.save(entity);
        });

        Map<String, Object> result = new HashMap<>();
        result.put("paymentTransactionId", txnId);
        result.put("restockingFee", feePercent);
        result.put("restockingFeeAmount", feeAmount);
        result.put("netRefundAmount", netRefund);
        result.put("refundStatus", "DISBURSED");
        return result;
    }
}
