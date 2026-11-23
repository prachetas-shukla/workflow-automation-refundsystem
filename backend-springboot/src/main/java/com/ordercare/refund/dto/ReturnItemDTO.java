package com.ordercare.refund.dto;

public class ReturnItemDTO {
    private String sku = "SKU-ITEM-01";
    private String productCategory;
    private Double itemPrice;

    public String getSku() { return sku; }
    public void setSku(String sku) { this.sku = sku; }

    public String getProductCategory() { return productCategory; }
    public void setProductCategory(String productCategory) { this.productCategory = productCategory; }

    public Double getItemPrice() { return itemPrice; }
    public void setItemPrice(Double itemPrice) { this.itemPrice = itemPrice; }
}
