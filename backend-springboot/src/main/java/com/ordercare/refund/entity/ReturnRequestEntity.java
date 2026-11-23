package com.ordercare.refund.entity;

import jakarta.persistence.*;
import java.time.LocalDateTime;

@Entity
@Table(name = "return_requests")
public class ReturnRequestEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(unique = true, nullable = false)
    private String processInstanceKey;

    private String productCategory;
    private Double itemPrice;
    private Integer daysSinceDelivery;
    private String customerTier;
    private Integer itemCount;

    private String policyDecision;
    private Double restockingFee;
    private Double netRefundAmount;
    private String paymentTransactionId;
    private String status;

    @Column(columnDefinition = "TEXT")
    private String itemsJson;

    private LocalDateTime createdAt = LocalDateTime.now();
    private LocalDateTime updatedAt = LocalDateTime.now();

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }

    public String getProcessInstanceKey() { return processInstanceKey; }
    public void setProcessInstanceKey(String processInstanceKey) { this.processInstanceKey = processInstanceKey; }

    public String getProductCategory() { return productCategory; }
    public void setProductCategory(String productCategory) { this.productCategory = productCategory; }

    public Double getItemPrice() { return itemPrice; }
    public void setItemPrice(Double itemPrice) { this.itemPrice = itemPrice; }

    public Integer getDaysSinceDelivery() { return daysSinceDelivery; }
    public void setDaysSinceDelivery(Integer daysSinceDelivery) { this.daysSinceDelivery = daysSinceDelivery; }

    public String getCustomerTier() { return customerTier; }
    public void setCustomerTier(String customerTier) { this.customerTier = customerTier; }

    public Integer getItemCount() { return itemCount; }
    public void setItemCount(Integer itemCount) { this.itemCount = itemCount; }

    public String getPolicyDecision() { return policyDecision; }
    public void setPolicyDecision(String policyDecision) { this.policyDecision = policyDecision; }

    public Double getRestockingFee() { return restockingFee; }
    public void setRestockingFee(Double restockingFee) { this.restockingFee = restockingFee; }

    public Double getNetRefundAmount() { return netRefundAmount; }
    public void setNetRefundAmount(Double netRefundAmount) { this.netRefundAmount = netRefundAmount; }

    public String getPaymentTransactionId() { return paymentTransactionId; }
    public void setPaymentTransactionId(String paymentTransactionId) { this.paymentTransactionId = paymentTransactionId; }

    public String getStatus() { return status; }
    public void setStatus(String status) { this.status = status; }

    public String getItemsJson() { return itemsJson; }
    public void setItemsJson(String itemsJson) { this.itemsJson = itemsJson; }

    public LocalDateTime getCreatedAt() { return createdAt; }
    public void setCreatedAt(LocalDateTime createdAt) { this.createdAt = createdAt; }

    public LocalDateTime getUpdatedAt() { return updatedAt; }
    public void setUpdatedAt(LocalDateTime updatedAt) { this.updatedAt = updatedAt; }
}
