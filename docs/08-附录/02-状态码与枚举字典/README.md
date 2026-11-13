<a id="appendix-b"></a>

# 附录B  状态码与枚举字典

> 来源：《蒙牛菲律宾冰淇淋经销商运营系统 PRD V1.0》附录 B。原文状态为“需求评审稿（待业务方确认）”，本文件按模块整理，未改变业务规则。

[返回文档总目录](../../README.md)

为保证接口、报表与前端展示一致，所有状态与枚举在系统中以固定英文代码存储，展示层按语言映射。下表为完整字典，新增枚举须同步更新本表与接口文档。

**表120  状态码字典**

| 枚举组 | 代码 | 中文展示 | 英文展示 |
| --- | --- | --- | --- |
| 订单状态 | DRAFT | 草稿 | Draft |
| 订单状态 | PENDING | 待审核 | Pending Approval |
| 订单状态 | APPROVED | 审核通过 | Approved |
| 订单状态 | DELIVERING | 配送中 | Delivering |
| 订单状态 | COMPLETED | 已完成 | Completed |
| 订单状态 | REJECTED | 已驳回 | Rejected |
| 订单状态 | CANCELLED | 已取消 | Cancelled |
| 配送状态 | PENDING | 待配送 | Pending Delivery |
| 配送状态 | ASSIGNED | 已派车 | Assigned |
| 配送状态 | IN\_TRANSIT | 配送中 | In Transit |
| 配送状态 | DELIVERED | 已送达 | Delivered |
| 配送状态 | PARTIAL | 部分送达 | Partially Delivered |
| 配送状态 | FAILED | 配送失败 | Delivery Failed |
| 收款状态 | UNPAID | 未收款 | Unpaid |
| 收款状态 | PARTIAL\_PAID | 部分收款 | Partially Paid |
| 收款状态 | PAID | 已收款 | Paid |
| 收款状态 | OVERDUE | 超期未收 | Overdue |
| 收款状态 | PENDING\_CONFIRM | 已核销待确认 | Pending Confirmation |
| 收款状态 | BAD\_DEBT | 坏账 | Bad Debt |
| 客户状态 | PROSPECT | 潜在 | Prospect |
| 客户状态 | ACTIVE | 活跃 | Active |
| 客户状态 | DORMANT | 休眠 | Dormant |
| 客户状态 | CLOSED | 关闭 | Closed |
| 拜访状态 | PLANNED | 计划中 | Planned |
| 拜访状态 | CHECKED\_IN | 已签到 | Checked In |
| 拜访状态 | FINISHED | 已完成 | Finished |
| 拜访状态 | SKIPPED | 已跳过 | Skipped |
| 拜访状态 | ABNORMAL | 异常 | Abnormal |

## 相关文档

- [全局业务规则](../../01-系统总体要求/README.md#section-2-8)
- [单据状态体系](../../01-系统总体要求/README.md#section-2-9)
- [数据需求](../../05-数据需求/README.md)
