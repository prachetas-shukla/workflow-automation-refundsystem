package com.ordercare.refund.dto;

import java.util.List;

public class ReturnSubmissionDTO {
    private String productCategory;
    private Double itemPrice;
    private Integer daysSinceDelivery;
    private String customerTier;
    private List<ReturnItemDTO> returnItems;

    public String getProductCategory() { return productCategory; }
    public void setProductCategory(String productCategory) { this.productCategory = productCategory; }

    public Double getItemPrice() { return itemPrice; }
    public void setItemPrice(Double itemPrice) { this.itemPrice = itemPrice; }

    public Integer getDaysSinceDelivery() { return daysSinceDelivery; }
    public void setDaysSinceDelivery(Integer daysSinceDelivery) { this.daysSinceDelivery = daysSinceDelivery; }

    public String getCustomerTier() { return customerTier; }
    public void setCustomerTier(String customerTier) { this.customerTier = customerTier; }

    public List<ReturnItemDTO> getReturnItems() { return returnItems; }
    public void setReturnItems(List<ReturnItemDTO> returnItems) { this.returnItems = returnItems; }
}
