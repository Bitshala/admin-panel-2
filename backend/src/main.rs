use actix_cors::Cors;

use actix_web::{
    App, HttpResponse, HttpServer, Responder, Result, get, http::header, middleware::Logger, post,
    web,
};
use chrono::{Datelike, Local};

use rusqlite::{Connection, params};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::Path;
use std::{path::PathBuf, sync::Mutex};
use thiserror::Error;
mod utils;
use std::fs;
use utils::classroom::{Assignment, get_submitted_assignments};

#[derive(Debug, Error)]
pub enum AppError {
    #[error("Sqlite DB error: {0}")]
    SQLITE(#[from] rusqlite::Error),
}

#[derive(Debug, Error)]
pub enum DbError {
    #[error("Database error: {0}")]
    DatabaseError(String),
}

impl From<AppError> for std::io::Error {
    fn from(err: AppError) -> std::io::Error {
        match err {
            AppError::SQLITE(e) => std::io::Error::other(format!("SQLite error: {}", e)),
        }
    }
}

impl From<AppError> for actix_web::Error {
    fn from(err: AppError) -> actix_web::Error {
        match err {
            AppError::SQLITE(e) => {
                actix_web::error::ErrorInternalServerError(format!("Actix Web Error: {}", e))
            }
        }
    }
}

// --- Struct Definitions ---
#[derive(Deserialize, Serialize)]
struct TaLogin {
    gmail: String,
}

// TODO: Remove optional values.
// Change fa, fb, fc to its actual names.
#[derive(Serialize, Deserialize, Debug, Clone, PartialEq, Eq, PartialOrd, Ord)]
pub struct RowData {
    pub name: String,
    pub group_id: String,
    pub ta: Option<String>,
    pub attendance: Option<String>,
    pub fa: Option<u64>,
    pub fb: Option<u64>,
    pub fc: Option<u64>,
    pub fd: Option<u64>,
    pub bonus_attempt: Option<u64>,
    pub bonus_answer_quality: Option<u64>,
    pub bonus_follow_up: Option<u64>,
    pub exercise_submitted: Option<String>,
    pub exercise_test_passing: Option<String>,
    pub exercise_good_documentation: Option<String>,
    pub exercise_good_structure: Option<String>,
    pub total: Option<u64>,
    pub mail: String,
    pub week: i32,
}

impl Default for RowData {
    fn default() -> Self {
        RowData {
            name: String::new(),
            group_id: String::new(),
            ta: None,
            attendance: Some("no".to_string()),
            fa: Some(0),
            fb: Some(0),
            fc: Some(0),
            fd: Some(0),
            bonus_attempt: Some(0),
            bonus_answer_quality: Some(0),
            bonus_follow_up: Some(0),
            exercise_submitted: Some("no".to_string()),
            exercise_test_passing: Some("no".to_string()),
            exercise_good_documentation: Some("no".to_string()),
            exercise_good_structure: Some("no".to_string()),
            total: Some(0),
            mail: String::new(),
            week: 0,
        }
    }
}

// The whole state table
pub struct Table {
    rows: Vec<RowData>,
}

impl Table {
    pub fn insert_or_update(&mut self, row: &RowData) -> Result<(), AppError> {
        let existing_row = self
            .rows
            .iter_mut()
            .find(|r| r.name == row.name && r.week == row.week);
        if let Some(existing_row) = existing_row {
            if *existing_row != *row {
                println!("Data has changed for {} in week {}", row.name, row.week);
            }
            *existing_row = row.clone();
        } else {
            println!("Inserting new row for {} in week {}", row.name, row.week);
            self.rows.push(row.clone());
        }
        Ok(())
    }
}

pub fn get_github_to_name_mapping(path: &PathBuf, github_username: &String) -> Option<String> {
    let conn = Connection::open(path).ok()?;
    let mut stmt = conn
        .prepare("SELECT Name FROM Participants WHERE Github LIKE ?")
        .ok()?;

    let pattern = format!("%{}", github_username);
    let mut rows = stmt
        .query_map([&pattern], |row| {
            Ok(row.get::<_, String>(0)?) // Name
        })
        .ok()?;
    if let Some(Ok(name)) = rows.next() {
        Some(name)
    } else {
        None
    }
}

//data functions
pub fn read_from_db(path: &PathBuf) -> Result<Table, AppError> {
    let conn = Connection::open(path)?;
    let mut stmt = conn.prepare("SELECT * FROM students")?;
    let rows = stmt.query_map([], |row| {
        Ok(RowData {
            name: row.get(0)?,
            group_id: row.get(1)?,
            ta: row.get(2).ok(),
            attendance: row.get(3).ok(),
            fa: row.get(4).ok().map(|v: f64| v as u64), // Convert Real to u64
            fb: row.get(5).ok().map(|v: f64| v as u64),
            fc: row.get(6).ok().map(|v: f64| v as u64),
            fd: row.get(7).ok().map(|v: f64| v as u64),
            bonus_attempt: row.get(8).ok().map(|v: f64| v as u64),
            bonus_answer_quality: row.get(9).ok().map(|v: f64| v as u64),
            bonus_follow_up: row.get(10).ok().map(|v: f64| v as u64),
            exercise_submitted: row.get(11).ok(),
            exercise_test_passing: row.get(12).ok(),
            exercise_good_documentation: row.get(13).ok(),
            exercise_good_structure: row.get(14).ok(),
            total: row.get(15).ok().map(|v: f64| v as u64),
            mail: row.get(16)?,
            week: row.get(17)?,
        })
    })?;

    let rows_vec = rows.filter_map(Result::ok).collect();
    Ok(Table { rows: rows_vec })
}

pub fn write_to_db(path: &PathBuf, table: &Table) -> Result<(), AppError> {
    println!("Writing to DB at path: {:?}", path);
    let mut conn = Connection::open(path)?;
    let tx = conn.transaction()?;

    tx.execute("DELETE FROM students", [])?;

    for row in &table.rows {
        tx.execute(
            "INSERT INTO students (name, group_id, ta, attendance, fa, fb, fc, fd, bonus_attempt, bonus_answer_quality, bonus_follow_up, exercise_submitted, exercise_test_passing, exercise_good_documentation, exercise_good_structure, total, mail, week) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18)",
            params![
                row.name,
                row.group_id,
                row.ta,
                row.attendance,
                row.fa,
                row.fb,
                row.fc,
                row.fd,
                row.bonus_attempt,
                row.bonus_answer_quality,
                row.bonus_follow_up,
                row.exercise_submitted,
                row.exercise_test_passing,
                row.exercise_good_documentation,
                row.exercise_good_structure,
                row.total,
                row.mail,
                row.week
            ],
        )?;
    }

    tx.commit()?;
    Ok(())
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord)]
enum TA {
    AnmolSharma,
    Bala,
    Raj,
    Setu,
    Delcin,
    Beulah,
}

impl TA {
    // Returns all variants of the enum
    fn all_variants() -> &'static [TA] {
        &[
            TA::AnmolSharma,
            TA::Bala,
            TA::Raj,
            TA::Setu,
            TA::Delcin,
            TA::Beulah,
        ]
    }

    pub fn from_email(email: &str) -> Option<Self> {
        match email {
            "anmolsharma0234@gmail.com" => Some(TA::AnmolSharma),
            "balajic86@gmail.com" => Some(TA::Bala),
            "raj@bitshala.org" => Some(TA::Raj),
            "setu@bitshala.org" => Some(TA::Setu),
            "delcinraj@gmail.com" => Some(TA::Delcin),
            "beulahebenezer777@gmail.com" => Some(TA::Beulah),
            _ => None,
        }
    }
}

const TOKEN: &str = "token-mpzbqlbbxtjrjyxcwigsexdqadxmgumdizmnpwocfdobjkfdxwhflnhvavplpgyxtsplxisvxalvwgvjwdyvusvalapxeqjdhnsyoyhywcdwucshdoyvefpnobnslqfg";
// --- Handlers ---
#[post("/login")]
/// Only allow TAs to login with specific emails.
/// On success, send a string token back to the frontend.
async fn login(item: web::Json<TaLogin>) -> impl Responder {
    println!("TA login attempt: {:?}", item.gmail);
    if let Some(ta) = TA::from_email(&item.gmail) {
        println!("TA login success.");
        // For demonstration, use a simple token (in production, use JWT or similar)
        let token = format!("{}", TOKEN);
        HttpResponse::Ok().json(serde_json::json!({
            "status": "success",
            "message": format!("Access granted for TA: {:?}", ta),
            "token": token
        }))
    } else {
        HttpResponse::Unauthorized().json(serde_json::json!({
            "status": "error",
            "message": format!("Access denied for email: {}", item.gmail)
        }))
    }
}

#[get("/students/count")]
async fn get_total_student_count(state: web::Data<Mutex<Table>>) -> impl Responder {
    println!("Fetching total student count");
    let count = state
        .lock()
        .unwrap()
        .rows
        .iter()
        .filter(|row| row.week == 0)
        .count();
    HttpResponse::Ok().json(serde_json::json!({ "count": count }))
}

#[get("/attendance/weekly_counts/{week}")]
async fn get_weekly_attendance_count_for_week(
    week: web::Path<i32>,
    state: web::Data<Mutex<Table>>,
) -> impl Responder {
    println!("Fetching attendance count for week: {}", week);
    let count = state
        .lock()
        .unwrap()
        .rows
        .iter()
        .filter(|row| row.week == *week && row.attendance == Some("yes".to_string()))
        .count();

    HttpResponse::Ok().json(serde_json::json!({
        "week": week.into_inner(),
        "attended": count
    }))
}

#[get("/weekly_data/{week}")]
async fn get_weekly_data_or_common(
    week: web::Path<i32>,
    state: web::Data<Mutex<Table>>,
    req: actix_web::HttpRequest,
) -> impl Responder {
    use std::path::PathBuf;

    // Check for the token in the Authorization header
    println!("getting data from backend");
    let auth_header = req
        .headers()
        .get(actix_web::http::header::AUTHORIZATION)
        .and_then(|h| h.to_str().ok());

    if auth_header != Some(TOKEN) {
        return HttpResponse::Unauthorized().json(serde_json::json!({
            "status": "error",
            "message": "Unauthorized: missing or invalid token"
        }));
    }

    let week = week.into_inner();
    println!("Getting and updating weekly data for week: {}", week);

    let mut state_table = state.lock().unwrap();

    if week == 0 && !state_table.rows.is_empty() {
        let week_0_rows: Vec<RowData> = state_table
            .rows
            .iter()
            .filter(|row| row.week == 0)
            .cloned()
            .collect();

        return HttpResponse::Ok().json(week_0_rows);
    } else if week >= 1 {
        let tas: Vec<TA> = TA::all_variants()
            .iter()
            .cloned()
            .filter(|ta| *ta != TA::Setu)
            .collect();

        let mut prev_week_rows: Vec<RowData> = state_table
            .rows
            .iter()
            .filter(|row| row.week == week - 1)
            .cloned()
            .collect();

        // sort by attendance.
        prev_week_rows.sort_by(|a, b| {
            b.attendance
                .partial_cmp(&a.attendance)
                .unwrap_or(std::cmp::Ordering::Equal)
                .then_with(|| {
                    b.total
                        .partial_cmp(&a.total)
                        .unwrap_or(std::cmp::Ordering::Equal)
                        .then_with(|| b.name.cmp(&a.name))
                })
        });

        let mut result_rows: Vec<RowData> = Vec::new();
        let mut group_id: isize = -1;

        let assignments = get_submitted_assignments(week).await.unwrap();
        println!("{:#?}", assignments);
        let submitted: Vec<&Assignment> = assignments.iter().filter(|a| a.is_submitted()).collect();

        let mut name_to_assignment: HashMap<String, &Assignment> = HashMap::new();
        let db_path = PathBuf::from("classroom.db"); // Adjust path as needed

        for assignment in &submitted {
            println!("{:#?}", assignment);
            if let Some(participant_name) =
                get_github_to_name_mapping(&db_path, &assignment.github_username)
            {
                println!(
                    "Mapped GitHub '{}' to participant '{}'",
                    assignment.github_username, participant_name
                );
                name_to_assignment.insert(participant_name, assignment);
            }
        }

        for (index, mut row) in prev_week_rows.into_iter().enumerate() {
            if row.attendance.as_deref() == Some("no") {
                row.group_id = format!("Group {}", 6);
                row.ta = Some("Setu".to_string());
            } else if row.attendance.as_deref() == Some("yes") {
                if index < 30 {
                    if index % 6 == 0 {
                        group_id += 1;
                    }
                } else {
                    group_id += 1;
                }
                let index = (group_id as usize) % tas.len();
                let assigned_ta = &tas[(index + week as usize - 1) % tas.len()];
                row.group_id = format!("Group {}", index + 1);
                row.ta = Some(format!("{:?}", assigned_ta));
            }
            row.week = week;

            if let Some(existing_row) = state_table
                .rows
                .iter()
                .find(|r| r.name == row.name && r.week == week)
            {
                row.attendance = existing_row.attendance.clone();
                row.fa = existing_row.fa;
                row.fb = existing_row.fb;
                row.fc = existing_row.fc;
                row.fd = existing_row.fd;
                row.bonus_attempt = existing_row.bonus_attempt;
                row.bonus_answer_quality = existing_row.bonus_answer_quality;
                row.bonus_follow_up = existing_row.bonus_follow_up;
                row.exercise_submitted = existing_row.exercise_submitted.clone();
                row.exercise_test_passing = existing_row.exercise_test_passing.clone();
                row.exercise_good_documentation = existing_row.exercise_good_documentation.clone();
                row.exercise_good_structure = existing_row.exercise_good_structure.clone();
                row.total = existing_row.total;
            } else {
                row.attendance = Some("no".to_string());
                row.fa = Some(0);
                row.fb = Some(0);
                row.fc = Some(0);
                row.fd = Some(0);
                row.bonus_attempt = Some(0);
                row.bonus_answer_quality = Some(0);
                row.bonus_follow_up = Some(0);
                row.exercise_submitted = Some("no".to_string());
                row.exercise_test_passing = Some("no".to_string());
                row.exercise_good_documentation = Some("no".to_string());
                row.exercise_good_structure = Some("no".to_string());
                row.total = Some(0);
            }

            if let Some(matching_assignment) = name_to_assignment.get(&row.name) {
                if matching_assignment.get_week() == week.to_string() {
                    // Remove parentheses
                    println!("Found assignment for participant: {}", row.name);
                    row.exercise_submitted = Some("yes".to_string());
                    row.exercise_test_passing =
                        Some(if matching_assignment.points_awarded == "100" {
                            "yes".to_string()
                        } else {
                            "no".to_string()
                        });
                }
            }

            state_table.insert_or_update(&row).unwrap();
            result_rows.push(row);
        }

        write_to_db(&PathBuf::from("classroom.db"), &state_table).unwrap();

        return HttpResponse::Ok().json(result_rows);
    }

    HttpResponse::BadRequest().json(serde_json::json!({
        "status": "error",
        "message": "Invalid week number"
    }))
}

#[post("/del/{week}")]
async fn delete_data(
    _week: web::Path<i32>,
    row_to_delete: web::Json<RowData>,
    state: web::Data<Mutex<Table>>,
) -> Result<HttpResponse, actix_web::Error> {
    let db_path = PathBuf::from("classroom.db");

    let mut state_table = state.lock().unwrap();
    // Only remove the row that matches name, mail, and week
    if let Some(pos) = state_table.rows.iter().position(|row| {
        row.name == row_to_delete.name
            && row.mail == row_to_delete.mail
            && row.week == row_to_delete.week
    }) {
        state_table.rows.remove(pos);
    }

    write_to_db(&db_path, &state_table)?;

    Ok(HttpResponse::Ok().body("Weekly data inserted/updated successfully"))
}

#[post("/weekly_data/{week}")]
async fn add_weekly_data(
    _week: web::Path<i32>,
    student_data: web::Json<Vec<RowData>>,
    state: web::Data<Mutex<Table>>,
) -> Result<HttpResponse, actix_web::Error> {
    let db_path = PathBuf::from("classroom.db");
    let mut state_table = state.lock().unwrap();

    for incoming_row in student_data.iter() {
        state_table.insert_or_update(incoming_row)?;
    }

    write_to_db(&db_path, &state_table)?;

    Ok(HttpResponse::Ok().body("Weekly data inserted/updated successfully"))
}

fn backup(db_name: &str) -> Result<(), DbError> {
    let db_path = Path::new("./").join(db_name);

    if db_path.exists() {
        let backup_dir = Path::new("./backup");
        fs::create_dir_all(Path::new("./backup")).unwrap();

        let now = Local::now();
        let day_of_week = now.format("%A"); // e.g., Monday
        let date_time = now.format("%Y-%m-%d"); // e.g., 2024-06-07_15-30-00
        let backup_file = backup_dir.join(format!("{}_{}_{}.db", db_name, day_of_week, date_time));
        fs::copy(&db_path, &backup_file).unwrap();
    } else {
        return Err(DbError::DatabaseError(format!(
            "Database file '{}' not found in project root.",
            db_name
        )));
    }

    Ok(())
}

#[actix_web::main]
async fn main() -> Result<(), std::io::Error> {
    //env_logger::init_from_env(env_logger::Env::default().default_filter_or("info"));

    // Spawn a background thread to periodically check and save the database on Wed/Sat
    std::thread::spawn(|| {
        loop {
            let now = chrono::Local::now();
            let weekday = now.date_naive().weekday();
            if weekday == chrono::Weekday::Mon || weekday == chrono::Weekday::Sat {
                let db_name = "classroom.db";
                let _result = backup(&db_name);
                // Sleep for 24 hours to avoid repeated saves on the same day
                std::thread::sleep(std::time::Duration::from_secs(60 * 60 * 24));
            } else {
                // Check again in 1 hour
                std::thread::sleep(std::time::Duration::from_secs(60 * 60));
            }
        }
    });

    let table = read_from_db(&PathBuf::from("classroom.db"))?;
    let state = web::Data::new(Mutex::new(table));

    // Process shit depending upon query.
    HttpServer::new(move || {
        let cors = Cors::default()
            .allow_any_origin()
            .allowed_methods(vec!["GET", "POST", "PUT", "DELETE"])
            .allowed_headers(vec![
                header::AUTHORIZATION,
                header::ACCEPT,
                header::CONTENT_TYPE,
            ])
            .supports_credentials()
            .max_age(3600);

        App::new()
            .app_data(state.clone())
            .wrap(cors)
            .wrap(Logger::default())
            .service(login)
            .service(delete_data)
            .service(get_weekly_data_or_common)
            .service(add_weekly_data)
            .service(get_total_student_count)
            .service(get_weekly_attendance_count_for_week)
    })
    .bind(("127.0.0.1", 8081))?
    .run()
    .await?;

    // Save Everything to the database at the end

    Ok(())
}

#[test]
fn test() {
    use rand::seq::SliceRandom;
    use rand::{Rng, thread_rng};

    let mut rng = thread_rng();
    let names = vec![
        "Alice", "Bob", "Charlie", "David", "Eve", "Frank", "Grace", "Hank", "Ivy", "Jack",
        "Karen", "Leo", "Mona", "Nina", "Oscar", "Paul", "Quinn", "Rita", "Steve", "Tina",
    ];
    let emails = vec![
        "alice@example.com",
        "bob@example.com",
        "charlie@example.com",
        "david@example.com",
        "eve@example.com",
        "frank@example.com",
        "grace@example.com",
        "hank@example.com",
        "ivy@example.com",
        "jack@example.com",
        "karen@example.com",
        "leo@example.com",
        "mona@example.com",
        "nina@example.com",
        "oscar@example.com",
        "paul@example.com",
        "quinn@example.com",
        "rita@example.com",
        "steve@example.com",
        "tina@example.com",
    ];

    let mut rows = Vec::new();
    for i in 0..20 {
        rows.push(RowData {
            name: names[i].to_string(),
            group_id: format!("Group {}", (i / 5) + 1),
            ta: None,
            attendance: Some(if i % 2 == 0 {
                "no".to_string()
            } else {
                "no".to_string()
            }),
            fa: Some(rng.gen_range(0..10)),
            fb: Some(rng.gen_range(0..10)),
            fc: Some(rng.gen_range(0..10)),
            fd: Some(rng.gen_range(0..10)),
            bonus_attempt: Some(rng.gen_range(0..5)),
            bonus_answer_quality: Some(rng.gen_range(0..5)),
            bonus_follow_up: Some(rng.gen_range(0..5)),
            exercise_submitted: Some(if i % 3 == 0 {
                "yes".to_string()
            } else {
                "no".to_string()
            }),
            exercise_test_passing: Some(if i % 4 == 0 {
                "yes".to_string()
            } else {
                "no".to_string()
            }),
            exercise_good_documentation: Some(if i % 5 == 0 {
                "yes".to_string()
            } else {
                "no".to_string()
            }),
            exercise_good_structure: Some(if i % 6 == 0 {
                "yes".to_string()
            } else {
                "no".to_string()
            }),
            total: Some(rng.gen_range(0..100)),
            mail: emails[i].to_string(),
            week: rng.gen_range(1..5),
        });
    }

    let mut sorted_rows = rows;
    sorted_rows.sort_by(|a, b| {
        b.total
            .partial_cmp(&a.total)
            .unwrap_or(std::cmp::Ordering::Equal)
    });
    for row in &sorted_rows {
        println!(
            "Name: {}, Attn: {:?}, Total Score: {:?}",
            row.name, row.attendance, row.total
        );
    }

    // Shuffle TAs for this week
    let mut rng = thread_rng();
    let mut tas = TA::all_variants().to_vec();
    tas.shuffle(&mut rng);

    for (idx, row) in sorted_rows.iter().enumerate() {
        let (group_id, assigned_ta) = if row.attendance.as_deref() == Some("yes") {
            (
                format!("Group {}", (idx / 5) + 1),
                tas[(idx / 5) % tas.len()],
            )
        } else {
            ("Group 6".to_string(), TA::Setu)
        };

        println!("{} - {} - {:?}", row.name, group_id, assigned_ta);
    }
}
