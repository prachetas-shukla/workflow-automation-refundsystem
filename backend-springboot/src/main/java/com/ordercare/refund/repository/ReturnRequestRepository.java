package com.ordercare.refund.repository;

import com.ordercare.refund.entity.ReturnRequestEntity;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;
import java.util.Optional;

public interface ReturnRequestRepository extends JpaRepository<ReturnRequestEntity, Long> {
    Optional<ReturnRequestEntity> findByProcessInstanceKey(String processInstanceKey);
    List<ReturnRequestEntity> findAllByOrderByCreatedAtDesc();
}
