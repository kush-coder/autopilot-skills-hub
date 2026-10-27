use std::ffi::OsStr;
use std::process::Command;

#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x0800_0000;

pub fn background_command(program: impl AsRef<OsStr>) -> Command {
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;

        let mut command = Command::new(program);
        command.creation_flags(CREATE_NO_WINDOW);
        command
    }
    #[cfg(not(windows))]
    {
        Command::new(program)
    }
}

#[cfg(test)]
mod tests {
    use super::background_command;

    #[test]
    fn background_command_preserves_normal_process_output() {
        #[cfg(windows)]
        let output = background_command("cmd")
            .args(["/C", "echo", "skills-hub"])
            .output()
            .unwrap();
        #[cfg(not(windows))]
        let output = background_command("sh")
            .args(["-c", "printf skills-hub"])
            .output()
            .unwrap();

        assert!(output.status.success());
        assert!(String::from_utf8_lossy(&output.stdout).contains("skills-hub"));
    }

    #[cfg(windows)]
    #[test]
    fn windows_background_command_has_no_console_window() {
        let output = background_command(std::env::current_exe().unwrap())
            .args([
                "--exact",
                "core::process::tests::windows_console_probe_child",
                "--nocapture",
            ])
            .env("SKILLS_HUB_CONSOLE_PROBE", "1")
            .output()
            .unwrap();

        assert!(output.status.success());
        assert!(String::from_utf8_lossy(&output.stdout).contains("CONSOLE_WINDOW=false"));
    }

    #[cfg(windows)]
    #[test]
    fn windows_console_probe_child() {
        if std::env::var_os("SKILLS_HUB_CONSOLE_PROBE").is_none() {
            return;
        }

        #[link(name = "Kernel32")]
        extern "system" {
            fn GetConsoleWindow() -> *mut std::ffi::c_void;
        }

        let has_console = unsafe { !GetConsoleWindow().is_null() };
        println!("CONSOLE_WINDOW={has_console}");
    }
}
