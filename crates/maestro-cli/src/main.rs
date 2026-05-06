use anyhow::Result;
use clap::{Parser, Subcommand};

#[derive(Parser)]
#[command(
    name = "maestro",
    about = "Maestro — deterministic Claude Code pipeline orchestrator"
)]
struct Cli {
    #[command(subcommand)]
    command: Commands,
}

#[derive(Subcommand)]
enum Commands {
    /// Start the Maestro daemon (alias: run `maestro-daemon` directly)
    Daemon {
        #[arg(short, long, env = "MAESTRO_PORT", default_value_t = 5172)]
        port: u16,
    },
    /// Signal that the current NodeRun has completed successfully
    Complete,
    /// Signal that the current NodeRun has failed
    Fail {
        #[arg(long)]
        reason: String,
    },
}

fn main() -> Result<()> {
    let cli = Cli::parse();
    match cli.command {
        Commands::Daemon { port } => {
            eprintln!(
                "Use `maestro-daemon --port {port}` to start the daemon directly.\n\
                 The `maestro daemon` subcommand will proxy to it in a future slice."
            );
        }
        Commands::Complete => {
            eprintln!("maestro complete: not yet implemented (needs daemon connection)");
        }
        Commands::Fail { reason } => {
            eprintln!("maestro fail: not yet implemented (reason: {reason})");
        }
    }
    Ok(())
}
