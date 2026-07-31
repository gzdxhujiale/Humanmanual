// 后端 CRUD 分层收口：行映射与事务样板统一从这里走，各业务模块不再手写
// "query → 逐列 get → 收集" 与 "begin → execute… → commit" 八股。
// - FromRow：每个 DTO 的列映射唯一存在处（加列只改 SELECT 和 from_row 两处）
// - query_all：统一行迭代循环，迭代错误经 `?` 传播，不静默吞错
// - with_txn：统一事务样板，闭包中途出错时 Transaction 随 drop 自动回滚

use std::future::Future;
use std::pin::Pin;

use libsql::{params::IntoParams, Connection, Row, Transaction};

use crate::error::AppResult;

/// DTO 与查询行的列映射契约。实现处紧邻 DTO 定义，列序只在此一处维护。
pub trait FromRow: Sized {
    fn from_row(row: &Row) -> AppResult<Self>;
}

/// 查询并把全部行收集为 `Vec<T>`。
pub async fn query_all<T: FromRow>(
    conn: &Connection,
    sql: &str,
    params: impl IntoParams,
) -> AppResult<Vec<T>> {
    let mut rows = conn.query(sql, params).await?;
    let mut out = Vec::new();
    while let Some(row) = rows.next().await? {
        out.push(T::from_row(&row)?);
    }
    Ok(out)
}

/// 事务闭包返回的 boxed future（借用事务引用）。
pub type TxnFuture<'a, T> = Pin<Box<dyn Future<Output = AppResult<T>> + Send + 'a>>;

/// 在单个事务内执行闭包：全部成功则 commit；闭包内任意 `?` 提前返回时
/// 事务未 commit，随 drop 自动回滚。调用写法：
/// `with_txn(&conn, |tx| Box::pin(async move { ...; Ok(()) })).await`
pub async fn with_txn<T, F>(conn: &Connection, f: F) -> AppResult<T>
where
    F: for<'a> FnOnce(&'a Transaction) -> TxnFuture<'a, T>,
{
    let tx = conn.transaction().await?;
    let out = f(&tx).await?;
    tx.commit().await?;
    Ok(out)
}
