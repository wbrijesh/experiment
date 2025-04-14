import { spawn } from 'child_process';
import { chromium } from 'playwright-core';
import dotenv from 'dotenv';

dotenv.config();

// --- Configuration ---
const PUBLIC_IP = '37.27.205.65'; // Your server's public IP
const DISPLAY_NUM = ':99';        // Virtual display number (can usually be kept)
const VNC_PORT = 5900;            // Standard VNC port
const SCREEN_WIDTH = 1920;        // Desired width for Xvfb AND viewport
const SCREEN_HEIGHT = 1080;       // Desired height for Xvfb AND viewport
const SCREEN_DEPTH = 30;          // Color depth (24 is highly compatible)
const SCREEN_RESOLUTION = `${SCREEN_WIDTH}x${SCREEN_HEIGHT}x${SCREEN_DEPTH}`; // Combined string for Xvfb
// Specify the exact path for the Chromium executable
const CHROMIUM_EXECUTABLE_PATH = process.env.CHROMIUM_EXECUTABLE_PATH;

if (!CHROMIUM_EXECUTABLE_PATH) {
    console.error("ERROR: CHROMIUM_EXECUTABLE_PATH environment variable is not set!");
    console.error("       User data script might have failed to find Chromium.");
    process.exit(1);
}

// --- Main Execution ---
async function run() {
  console.log(`Target Public IP: ${PUBLIC_IP}`);
  let xvfbProcess;
  let vncProcess;
  let browser;

  try {
    // 1. Start Xvfb (Virtual Display)
    //    Uses SCREEN_RESOLUTION (1920x1080x24)
    console.log(`Starting Xvfb on display ${DISPLAY_NUM} with geometry ${SCREEN_RESOLUTION}...`);
    xvfbProcess = spawn('Xvfb', [
      DISPLAY_NUM,
      '-screen', '0', SCREEN_RESOLUTION,
      '-ac', // Disable access control restrictions
      '+extension', 'RANDR', // Needed by some modern apps/toolkits
      '-nolisten', 'tcp' // Don't listen for X connections over TCP
    ], { detached: false, stdio: 'pipe' });

    // Basic readiness check for Xvfb (same as before)
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Xvfb startup timeout')), 5000);
      xvfbProcess.stderr.once('data', (data) => {
        clearTimeout(timer);
        setTimeout(resolve, 500);
      });
      xvfbProcess.once('error', (err) => {
        clearTimeout(timer);
        reject(new Error(`Failed to start Xvfb: ${err.message}`));
      });
      xvfbProcess.once('close', (code) => {
         if (!xvfbProcess.killed) reject(new Error(`Xvfb exited unexpectedly with code ${code}`));
      });
    });
    console.log("Xvfb appears ready.");

    // 2. Start x11vnc (VNC Server) - (same as before)
    console.log(`Starting x11vnc to share display ${DISPLAY_NUM} on port ${VNC_PORT}...`);
    const vncArgs = [ /* ... VNC arguments including -nopw ... */
      '-display', DISPLAY_NUM,
      '-rfbport', String(VNC_PORT),
      '-forever',
      '-shared',
      '-noxdamage',
      '-nopw' // !! SECURITY WARNING !!
    ];
    vncProcess = spawn('x11vnc', vncArgs, { detached: false, stdio: 'ignore' });
    vncProcess.on('error', (err) => { throw new Error(`Failed to start x11vnc: ${err.message}`); });
    await new Promise(resolve => setTimeout(resolve, 1000));
    console.log(`x11vnc started. Listening on 0.0.0.0:${VNC_PORT}`);


    // 3. Launch Chromium via Playwright (Non-Headless) - (same as before)
    console.log(`Launching Chromium from: ${CHROMIUM_EXECUTABLE_PATH}...`);
    const launchOptions = { /* ... options including executablePath, args, headless: false ... */
        headless: false,
        args: [
            `--display=${DISPLAY_NUM}`,
            '--disable-gpu',
            '--no-sandbox',
        ],
        executablePath: CHROMIUM_EXECUTABLE_PATH
    };
    browser = await chromium.launch(launchOptions);
    browser.on('disconnected', () => { /* ... handle disconnect ... */
        console.error('Browser disconnected unexpectedly! Shutting down...');
        cleanupAndExit(1);
    });

    // **** THIS IS THE KEY PART BASED ON YOUR EXAMPLE ****
    // Create a new browser context setting the viewport size to match the screen resolution
    console.log(`Creating browser context with viewport ${SCREEN_WIDTH}x${SCREEN_HEIGHT}...`);
    const context = await browser.newContext({
        viewport: { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } // Setting viewport here!
    });
    // *****************************************************

    const page = await context.newPage();
    console.log("Browser launched. Navigating to a test page...");
    await page.goto('https://example.com');
    console.log(`Current page title: ${await page.title()}`);


    // 4. Output the VNC Connection URL - (same as before)
    const vncUrl = `vnc://${PUBLIC_IP}:${VNC_PORT}`;
    console.log("\n**************************************************");
    console.log(` VNC Session Ready: ${vncUrl}`);
    console.log(` (Ensure server firewall allows inbound TCP on port ${VNC_PORT} from your IP)`);
    console.log("**************************************************\n");
    console.log("Browser session is running. Press Ctrl+C in this terminal to stop.");


    // 5. Setup Cleanup Handler - (same as before)
    process.on('SIGINT', () => cleanupAndExit(0));
    process.on('SIGTERM', () => cleanupAndExit(0));


    // 6. Keep the script alive - (same as before)
    await new Promise(() => {});

  } catch (error) { // (same as before)
    console.error("\n--- An Error Occurred During Setup ---");
    console.error(error);
    await cleanupAndExit(1);
  }

  // --- Cleanup Function --- (same as before)
  async function cleanupAndExit(exitCode = 0) {
    console.log('\nInitiating cleanup...');
    if (browser && typeof browser.isConnected === 'function' && browser.isConnected()) {
        console.log('Closing browser...');
        await browser.close().catch(err => console.error('Error closing browser:', err));
    } else if(browser) {
        console.log('Browser object exists but not connected or method unavailable.');
    } else {
        console.log('Browser not started or already cleaned up.');
    }
    if (vncProcess && !vncProcess.killed) {
        console.log('Stopping x11vnc...');
        vncProcess.kill('SIGTERM');
        await new Promise(resolve => setTimeout(resolve, 500));
        if (vncProcess && !vncProcess.killed) vncProcess.kill('SIGKILL');
    }
    if (xvfbProcess && !xvfbProcess.killed) {
        console.log('Stopping Xvfb...');
        xvfbProcess.kill('SIGTERM');
        await new Promise(resolve => setTimeout(resolve, 500));
        if (xvfbProcess && !xvfbProcess.killed) xvfbProcess.kill('SIGKILL');
    }
    console.log('Cleanup finished.');
    process.exit(exitCode);
  }
}

// --- Start the process ---
run();
