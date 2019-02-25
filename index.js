const os = require('os')
const path = require('path')
const fs = require('fs')
const childProcess = require('child_process')

const _platform = os.platform()
const _architecture = os.arch()

const homeDir = os.homedir()
const nodecertDir = path.join(homeDir, '.nodecert')
const mkcertBinary = mkcertBinaryForThisMachine()

module.exports = function () {
  // Create certificates.
  if (!allOK()) {

    // On Linux and on macOS, mkcert relies on the Mozilla nss library.
    // Make sure this is installed before continuing.
    ensureDependency()

    // Create the directory if it doesn’t already exist.
    if (!fs.existsSync(nodecertDir)) {
      fs.mkdirSync(nodecertDir)
    }

    // mkcert uses the CAROOT environment variable to know where to create/find the certificate authority.
    // We also pass the rest of the system environment to the spawned processes.
    const options = {
      env: process.env
    }
    options.env.CAROOT = nodecertDir

    try {
      // Create the local certificate authority.
      childProcess.execFileSync(mkcertBinary, ['-install'], options)

      // Create the local certificate.
      const createCertificateArguments = [
        `-key-file=${path.join(nodecertDir, 'localhost-key.pem')}`,
        `-cert-file=${path.join(nodecertDir, 'localhost.pem')}`,
        'localhost', '127.0.0.1', '::1'
      ]
      childProcess.execFileSync(mkcertBinary, createCertificateArguments, options)
    } catch (error) {
      console.log(error)
    }

    if (!allOK()) {
      process.exit(1)
    }
  } else {
    console.log(' 📜 [nodecert] Local development TLS certificate exists.')
  }
}()


// Check if the local certificate authority and local keys exist.
function allOK() {
  return fs.existsSync(path.join(nodecertDir, 'rootCA.pem')) && fs.existsSync(path.join(nodecertDir, 'rootCA-key.pem')) && fs.existsSync(path.join(nodecertDir, 'localhost.pem')) && fs.existsSync(path.join(nodecertDir, 'localhost-key.pem'))
}


// Returns the mkcert binary for this machine (platform + architecture) and
// throws an error if there isn’t one for it.
function mkcertBinaryForThisMachine() {
  const platformMap = {
    linux: 'linux',
    darwin: 'darwin',
    win32: 'windows'
  }

  const architectureMap = {
    arm: 'arm',
    x64: 'amd64'
  }

  const platform = platformMap[_platform]
  const architecture = architectureMap[_architecture]

  if (platform === undefined) throw new Error('Unsupported platform', _platform)
  if (architecture === undefined) throw new Error('Unsupported architecture', _architecture)

  const mkcertVersion = '1.3.0'

  let mkcertBinary = path.join(__dirname, 'mkcert-bin', `mkcert-v${mkcertVersion}-${platform}-${architecture}`)

  if (platform === 'windows') mkcertBinary += '.exe'

  // Check if the platform + architecture combination is supported.
  if (!fs.existsSync(mkcertBinary)) throw new Error(`Unsupported platform + architecture combination for ${platform}-${architecture}`)

  return mkcertBinary
}


// Does the passed command exist? Returns: bool.
function commandExists (command) {
  try {
    childProcess.execFileSync('which', [command], {env: process.env})
    return true
  } catch (error) {
    return false
  }
}


// On Linux, we must install nss for mkcert to work with both Chrome and Firefox.
// Depending on the platform we try to do so using apt, yum, or pacman. If none of
// those exist, we fail.
function installCertutilOnLinux() {
  let options = {env: process.env}
  try {
    if (commandExists('apt')) {
      options.env.DEBIAN_FRONTEND = 'noninteractive'
      childProcess.execSync('sudo apt-get install -y -q libnss3-tools', options)
    } else if (commandExists('yum')) {
      // Untested: if you test this, please let me know https://github.com/indie-mirror/https-server/issues
      childProcess.execSync('sudo yum install nss-tools', options)
    } else if (commandExists('pacman')) {
      // Untested: if you test this, please let me know https://github.com/indie-mirror/https-server/issues
      childProcess.execSync('sudo pacman -S nss', options)
    } else {
      throw new Error('No supported package manager found for installing certutil on Linux (tried apt, yum, and pacman. Please install certutil manually and run nodecert again. For more instructions on installing mkcert dependencies, please see https://github.com/FiloSottile/mkcert/')
    }
  } catch (error) {
    throw error
  }
}


// Mozilla’s nss is a prerequisite on Linux (for Chrome and Firefox)
// and on macOS (for Firefox). Ensure it exists.
function ensureDependency() {
  if (_platform === 'linux') {
    if (commandExists('certutil')) return

    try {
      installCertutilOnLinux()
    } catch (error) {
      console.log(error)
      process.exit(1)
    }
  } else if (_platform === 'darwin') {
    // On macOS, we must install nss for mkcert to work with Firefox. To
    // install nss, we can use either Homebrew or Macports. If neither of
    // those are installed, we default to installing Homebrew and using that
    // to install nss.

    // Check to see if we have brew or macports to work with (and install
    // Homebrew, if not.)
    let packageManager = null
    if (commandExists('brew')) {
      packageManager = 'brew'
    } else if (commandExists('port')) {
      console.log('MacPorts is installed.')
      packageManager = 'macports'
    } else {
      console.log('Neither Homebrew nor Macports are installed. Installing Homebrew (todo)')
      // TODO

      // After

      packageManager = 'brew'
    }

    // Check if nss is installed using the installed package manager.
    if (packageManager === 'brew') {
      // Check if nss installed using brew (we can’t just check using commandExists as
      // nss is installed as keg-only and not symlinked to /usr/local due to issues
      // with Firefox crashing).
      try {
        childProcess.execSync('brew list nss >/dev/null 2>&1', {env: process.env})
      } catch (error) {
        // NSS is not installed. Install it.
        try {
          childProcess.execSync('brew install nss >/dev/null 2>&1', {env: process.env})
        } catch (error) {
          console.log('Error while attempting to install required dependency (nss) with Homebrew. Please install the dependency manually and re-run this tool.')
          process.exit(1)
        }
      }
    } else if (packageManager === 'macports') {
      console.log('TODO: check if nss installed using macports - PANIC!')
      process.exit(1)      
    } else {
      // This should not happen.
      throw new Error(`Panic: Unknown state for package manager setting: ${packageManager}`)
    }
  }
}
