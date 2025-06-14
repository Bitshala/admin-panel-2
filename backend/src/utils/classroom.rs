use octocrab::Octocrab;
use serde::Deserialize;
use serde_json::Value;
use std::env;
use thiserror::Error;

// Represents a GitHub Classroom
#[derive(Debug, Deserialize)]
pub struct Classroom {
    id: u64,
    name: String,
    archived: bool,
    url: String, // URL to the classroom on classroom.github.com
}

#[derive(Debug, Deserialize, Clone)]
pub struct Assignment {
    pub assignment_name: String,
    pub assignment_url: String,
    pub github_username: String,
    pub points_available: String, // Consider changing to u32 if it's always numeric
    pub points_awarded: String,   // Consider changing to Option<u32>
    pub roster_identifier: String,
    pub starter_code_url: String,
    pub student_repository_name: String,
    pub student_repository_url: String,
    pub submission_timestamp: Option<String>, // Can be null if not submitted
}

// --- Custom Error type for better error handling ---
#[derive(Debug, Error)]
pub enum ClassroomError {
    #[error("GitHub API error: {0}")]
    Octocrab(#[from] octocrab::Error),
    #[error("Environment variable GITHUB_TOKEN not set")]
    MissingToken(#[from] env::VarError),
    #[error("Failed to parse API response: {0}")]
    ParseError(#[from] serde_json::Error),
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord)]
enum WEEK {
    One,
    Two,
}

impl WEEK {
    pub fn from_number(week_number: i32) -> Option<Self> {
        match week_number {
            1 => Some(WEEK::One),
            2 => Some(WEEK::Two),
            _ => None,
        }
    }

    pub fn to_assign_id(&self) -> u32 {
        match self {
            WEEK::One => 812582,
            WEEK::Two => 814648,
        }
    }
}

pub async fn get_submitted_assignments(
    week_number: i32,
) -> Result<Vec<Assignment>, ClassroomError> {
    let token = env::var("GITHUB_TOKEN")?;
    println!("GitHub token: {}", token);
    let octocrab = Octocrab::builder().personal_token(token).build()?;

    let week = if let Some(week) = WEEK::from_number(week_number) {
        week
    } else {
        return Ok(vec![]);
    };

    let assignment_id = week.to_assign_id();
    let endpoint = format!("/assignments/{assignment_id}/grades");
    let assignments: Vec<Assignment> = octocrab.get(endpoint, None::<&()>).await?;
    Ok(assignments)
}

impl Assignment {
    // Check if assignment was submitted
    pub fn is_submitted(&self) -> bool {
        self.submission_timestamp != Some("".to_string())
    }

    // Check if assignment was submitted
    pub fn get_week(&self) -> String {
        let number: String = self
            .assignment_name
            .chars()
            .filter(|c| c.is_numeric())
            .collect();
        return number;
    }
}
