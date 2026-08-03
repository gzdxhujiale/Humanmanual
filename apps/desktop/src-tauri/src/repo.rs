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

/// 类型安全且免疫任何类型/空值匹配崩溃的 Row 扩展接口
pub trait RowExt {
    fn parse_str(&self, idx: usize) -> String;
    fn parse_opt_str(&self, idx: usize) -> Option<String>;
    fn parse_i64(&self, idx: usize) -> i64;
    fn parse_opt_i64(&self, idx: usize) -> Option<i64>;
    fn parse_i32(&self, idx: usize) -> i32;
    fn parse_bool(&self, idx: usize) -> bool;
}

impl RowExt for Row {
    fn parse_str(&self, idx: usize) -> String {
        match self.get_value(idx as i32) {
            Ok(libsql::Value::Text(s)) => s,
            Ok(libsql::Value::Integer(n)) => n.to_string(),
            Ok(libsql::Value::Real(f)) => f.to_string(),
            _ => String::new(),
        }
    }

    fn parse_opt_str(&self, idx: usize) -> Option<String> {
        match self.get_value(idx as i32) {
            Ok(libsql::Value::Text(s)) if !s.trim().is_empty() => Some(s),
            Ok(libsql::Value::Integer(n)) => Some(n.to_string()),
            _ => None,
        }
    }

    fn parse_i64(&self, idx: usize) -> i64 {
        match self.get_value(idx as i32) {
            Ok(libsql::Value::Integer(n)) => n,
            Ok(libsql::Value::Real(f)) => f as i64,
            Ok(libsql::Value::Text(s)) => {
                if let Ok(n) = s.parse::<i64>() {
                    n
                } else if let Ok(dt) = chrono::DateTime::parse_from_rfc3339(&s) {
                    dt.timestamp_millis()
                } else {
                    0
                }
            }
            _ => 0,
        }
    }

    fn parse_opt_i64(&self, idx: usize) -> Option<i64> {
        match self.get_value(idx as i32) {
            Ok(libsql::Value::Integer(n)) => Some(n),
            Ok(libsql::Value::Real(f)) => Some(f as i64),
            Ok(libsql::Value::Text(s)) if !s.trim().is_empty() => {
                if let Ok(n) = s.parse::<i64>() {
                    Some(n)
                } else if let Ok(dt) = chrono::DateTime::parse_from_rfc3339(&s) {
                    Some(dt.timestamp_millis())
                } else {
                    None
                }
            }
            _ => None,
        }
    }

    fn parse_i32(&self, idx: usize) -> i32 {
        match self.get_value(idx as i32) {
            Ok(libsql::Value::Integer(n)) => n as i32,
            Ok(libsql::Value::Real(f)) => f as i32,
            Ok(libsql::Value::Text(s)) => s.parse::<i32>().unwrap_or(0),
            _ => 0,
        }
    }

    fn parse_bool(&self, idx: usize) -> bool {
        self.parse_i32(idx) != 0
    }
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
