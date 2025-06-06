//! Separate CLI tool for creating SQLite tables, importing CSV data, seeding TAs,
//! and populating the students table with initial data.
//!
//! Requirements (Cargo.toml in project root):
//!
//! ```toml
//! [dependencies]
//! rusqlite = { version = "0.29", features = ["bundled"] } # Adjust version as needed
//! csv = "1.1"
//! rand = "0.8"
//! ```
//!
//! Usage:
//! ```bash
//! # To run migration:
//! cargo run --bin migrate
//! ```
//!
//! This binary will:
//! - Drop `participants`, `students`, and `ta` tables if present.
//! - Create `participants`, `students`, and `ta` tables.
//! - Seed the `ta` table with a fixed list of names.
//! - Migrate all rows from `participants.csv` into `participants`.
//! - Populate the `students` table using data from `participants` and `ta` tables,
//!   assigning random groups and TAs, and setting default scores and statuses.
use csv::Reader;
use rusqlite::{Connection, params};
use std::error::Error;
// A structure used to get participant information from the table
struct ParticipantInfo {
    name: String,
    email: String, //TODO: Add more info in the particpants, add everything.
}

fn main() -> Result<(), Box<dyn Error>> {
    // Open or create the SQLite database in project root
    let conn = Connection::open("classroom.db")?;

    // Drop existing tables to ensure a fresh load
    conn.execute_batch(
        r#"
        DROP TABLE IF EXISTS participants;
        DROP TABLE IF EXISTS students;
        DROP TABLE IF EXISTS ta;
    "#,
    )?;
    println!("Dropped existing tables (if any).");

    // TODO: Change fa, fb, fc to their actual values.
    // Create tables
    conn.execute_batch(
        r#"
        CREATE TABLE participants (
            "ID"               TEXT PRIMARY KEY,
            "Name"             TEXT,
            "Token"            TEXT,
            "Enrolled"         INTEGER,
            "Role"             TEXT,
            "Email"            TEXT,
            "Describe Yourself" TEXT,
            "Background"       TEXT,
            "GitHub"           TEXT,
            "Skills"           TEXT,
            "Year"             TEXT,
            "Books"            TEXT,
            "Why"              TEXT,
            "Time"             TEXT,
            "Location"         TEXT,
            "Version"          INTEGER,
            "Cohort Name"      TEXT,
            "Created At"       TEXT,
            "Updated At"       TEXT
        );
        CREATE TABLE students (
            name                        TEXT NOT NULL,
            group_id                    TEXT,
            ta                          TEXT,
            attendance                  TEXT CHECK(attendance IN('yes','no')),
            fa                          REAL,
            fb                          REAL,
            fc                          REAL,
            fd                          REAL,
            bonus_attempt               REAL,
            bonus_answer_quality        REAL,
            bonus_follow_up             REAL,
            exercise_submitted          TEXT CHECK(exercise_submitted IN('yes','no')),
            exercise_test_passing       TEXT CHECK(exercise_test_passing IN('yes','no')),
            exercise_good_documentation TEXT CHECK(exercise_good_documentation IN('yes','no')),
            exercise_good_structure     TEXT CHECK(exercise_good_structure IN('yes','no')),
            total                       REAL,
            mail                        TEXT, -- This column will now store Email addresses
            week                        INTEGER
        );

        CREATE TABLE ta (
            id   INTEGER PRIMARY KEY,
            name TEXT NOT NULL UNIQUE
        );
    "#,
    )?;
    println!("Created tables: participants, students, ta.");

    // Q: Why? TA values can be hardcoded in the codebase.
    // Seed TA table with fixed list
    let ta_seed = vec![
        (1, "Anmol Sharma"),
        (2, "Bala"),
        (3, "delcin"),
        (4, "Beulah Evanjalin"),
        (5, "Raj"),
        (6, "Saurabh"),
    ];
    let mut ta_insert_stmt = conn.prepare("INSERT INTO ta (id, name) VALUES (?1, ?2)")?;
    for (id, name) in ta_seed {
        ta_insert_stmt.execute(params![id, name])?;
    }
    println!("Seeded TA table.");

    // Read and import CSV into participants table
    let mut reader = Reader::from_path("participants.csv")?;
    let mut insert_participant_stmt = conn.prepare(
        r#"
        INSERT OR REPLACE INTO participants (
            "ID", "Name", "Token", "Enrolled", "Role", "Email",
            "Describe Yourself", "Background", "GitHub", "Skills", "Year",
            "Books", "Why", "Time", "Location", "Version", "Cohort Name",
            "Created At", "Updated At"
        ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19)
    "#,
    )?;
    for result in reader.records() {
        let record = result?;
        let fields: Vec<&str> = record.iter().collect();
        if fields.len() != 19 {
            eprintln!(
                "Skipping row in participants.csv: expected 19 fields, got {}. Row data: {:?}",
                fields.len(),
                fields
            );
            continue;
        }
        insert_participant_stmt.execute(params![
            fields[0],
            fields[1],
            fields[2],                             // ID, Name, Token
            fields[3].parse::<i64>().unwrap_or(0), // Enrolled
            fields[4],
            fields[5],
            fields[6],
            fields[7], // Role, Email, Describe Yourself, Background
            fields[8],
            fields[9],
            fields[10],
            fields[11], // GitHub, Skills, Year, Books
            fields[12],
            fields[13],
            fields[14],                             // Why, Time, Location
            fields[15].parse::<i64>().unwrap_or(0), // Version
            fields[16],
            fields[17],
            fields[18], // Cohort Name, Created At, Updated At
        ])?;
    }
    println!("Imported data from participants.csv into participants table.");

    // --- Populate students table based on JavaScript logic ---
    println!("Populating students table...");

    // Define base groups (as in your JS `baseGroups` variable)
    // Q: Why different from base group?
    // TODO: Put them into enums.
    let _base_groups = ["Group 1", "Group 2", "Group 3", "Group 4", "Group 5"];

    // Fetch TA names from the ta table
    let mut stmt_fetch_tas = conn.prepare("SELECT name FROM ta")?;
    let ta_names_iter = stmt_fetch_tas.query_map([], |row| row.get(0))?;
    let mut ta_list: Vec<String> = Vec::new();
    for ta_name_result in ta_names_iter {
        ta_list.push(ta_name_result?);
    }

    // REVERTED: Fetch participant names and Email addresses from the participants table
    let mut stmt_fetch_participants =
        conn.prepare("SELECT \"Name\", \"Email\" FROM participants")?;
    let participants_iter = stmt_fetch_participants
        .query_map([], |row| {
            Ok(ParticipantInfo {
                name: row.get(0)?,
                email: row.get(1)?,
            })
        })?
        .collect::<Result<Vec<_>, _>>()?;

    let mut insert_student_stmt = conn.prepare(
        r#"
        INSERT INTO students (
            name, group_id, ta, attendance,
            fa, fb, fc, fd,
            bonus_attempt, bonus_answer_quality, bonus_follow_up,
            exercise_submitted, exercise_test_passing, exercise_good_documentation, exercise_good_structure,
            total, mail, week
        ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18)
        "#,
    )?;

    let mut student_records_created = 0;

    for participant in participants_iter {
        // Insert into students table
        match insert_student_stmt.execute(params![
            participant.name,  // name
            "NA",              // group_id
            "NA",              // ta
            "no",              // attendance (default false -> "no")
            0.0,               // fa
            0.0,               // fb
            0.0,               // fc
            0.0,               // fd
            "no",              // bonus_attendance (default false -> "no")
            "no",              // bonus_answer_quality (default false -> "no")
            "no",              // bonus_follow_up (default false -> "no")
            "no",              // exercise_submitted (default false -> "no")
            "no",              // exercise_test_passing (default false -> "no")
            "no",              // exercise_good_documentation (default false -> "no")
            "no",              // exercise_good_structure (default false -> "no")
            0.0,               // total
            participant.email, // REVERTED: mail (now sourced from participant.email)
            0                  // week (default 0)
        ]) {
            Ok(count) if count > 0 => student_records_created += 1,
            Ok(_) => { /* Potentially a conflict, and ON CONFLICT DO NOTHING was triggered */ }
            Err(e) => eprintln!("Failed to insert student {}: {}", participant.name, e),
        }
    }

    println!(
        "Populated students table with {} records.",
        student_records_created
    );
    println!("Migration, TA seeding, and initial student data population complete.");
    Ok(())
}
