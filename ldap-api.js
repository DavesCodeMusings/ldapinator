#!/usr/bin/env node

import { join } from 'path'
import { URL } from 'url'
import { readFileSync } from 'fs'
import ini from 'ini'
import ldapjs from 'ldapjs'
import { exec } from 'child_process'
import express from 'express'
import { createServer } from 'http'
import { createServer as createServerTLS } from 'https'


const __dirname = new URL('.', import.meta.url).pathname


/* Allow toggling of debug output by overriding console.debug() */
let debugLogging = process.argv.includes('-d')
let _console_debug = console.debug
console.debug = function(msg) {
  if (debugLogging) {
    _console_debug.apply(console, arguments)
  }
}


/* Read config file parameters and set defaults where possible */
const configFile = join(__dirname, 'config', 'config.ini')
var config = {}
var ldapServerURLs = [];
var apiAuthorization = '';

try {
  config = ini.parse(readFileSync(configFile, 'utf-8'))
  console.debug(`Settings from ${configFile}:`, config)
}
catch (ex) {
  console.error(`Unable to parse ${configFile}.`)
  console.debug(ex)
}

if (config.connect.hostURL) {
  ldapServerURLs.push(config.connect.hostURL)
}
else {
  ldapServerURLs.push('ldap://127.0.0.1:389')
}

apiAuthorization = 'Bearer ' + config.api.token


/* List of attributes that can be queried and updated via the API */
const allowedAttributes = [
  'cn',
  'description',
  'displayName',
  'gidNumber',
  'givenName',
  'homeDirectory',
  'initials',
  'mail',
  'memberUid',
  'objectClass',
  'sn',
  'uid',
  'uidNumber'
]


/**
 * Express middleware function to enforce authorization for any non-GET requests. 
 * @param {object} req  HTTP request object
 * @param {object} res  HTTP response object
 * @param {function} next  Next middleware function to pass control to
 */
function authCheck(req, res, next) {
  let requireAuthorization = true

  switch (req.method) {
    case 'GET':
      if (config.api.allowAnonymousRead == 'yes') {
        requireAuthorization = false
      }
    break
    case 'PUT':
      if (config.api.allowAnonymousModify == 'yes') {
        requireAuthorization = false
      }
    break
  }

  if (requireAuthorization && req.headers.authorization !== apiAuthorization) {
    res.status(401)
    res.send('An authentication token must be provided with this request')
    console.error('Missing or incorrect API token')
    console.debug('Expected', apiAuthorization)
    console.debug('Got:', req.headers.authorization)
  }
  else {
    next()
  }
}


/**
 * Connect to LDAP server and log in.
 * @param {string} serverURL 
 * @returns {promise} client object
 */
function connect(url, dn, password) {
  return new Promise((resolve, reject) => {
    const client = ldapjs.createClient({
      url: url
    })

    client.on('connect', () => {
      console.debug('Connected to:', url)
      console.debug('Binding as:', dn)
      client.bind(dn, password, (err) => {
        if (err) {
          console.debug(err.message)
          reject('Bind credentials rejected.')
        }
        else {
          resolve(client)
        }
      })
    })

    client.on('error', (err) => {
      reject('Unable to connect to ' + url)
    })
  })
}


/**
 * Search LDAP for one level of subordinate object names and classes.
 * @baseDN {string}  Where to search, like 'ou=People,dc=example,dc=com'
 * @returns {promise}  Resolves to array of distinguished names and object classes.
 */
async function getSubordinateObjects(baseDN) {
  let connection = await connect(ldapServerURLs, config.bind.readOnlyDN, config.bind.readOnlyPassword).catch((err) => {
    console.error('LDAP server error:', err)
    reject(err)
  })

  let opts = {
    scope: 'one'
  }

  // Only three attributes are of interest: dn (distinguished name), description, and any objectClasses.
  // objectClasses are used to determine if the node is a container or a leaf.
  let results = []
  return new Promise((resolve, reject) => {
    connection.search(baseDN, opts, (err, res) => {
      res.on('searchEntry', (entry) => {
        console.debug('dn:', entry.objectName)
        let descriptionAttributes = entry.attributes.filter(attribute => attribute.type == 'description')
        let description = ''  // description is single-valued, there should be one at most.
        if (descriptionAttributes.length !== 0) {
          console.debug('  attribute type:', descriptionAttributes[0].type)
          description = descriptionAttributes[0]._vals[0].toString();
          console.debug('    value:', description)
        }
        let classAttributes = entry.attributes.filter(attribute => attribute.type == 'objectClass')
        let objectClasses = []  // objectClass is multi-valued, there can be one or more.
        classAttributes.forEach(attribute => {
          console.debug('  attribute type:', attribute.type)
          attribute._vals.forEach(value => {
            console.debug('    value:', value.toString())
            objectClasses.push(value.toString())
          })
        })
        let collectedAttributes = {
          "dn": entry.objectName,
          "description": description,
          "classes": objectClasses
        }
        results.push(collectedAttributes)
      })

      res.on('error', (err) => {
        reject(err.message)
      })

      res.on('end', () => {
        connection.unbind(() => {
          resolve(results)
        })
      })
    })
  })
}


/**
 * Get LDAP attributes for the given object.
 * @baseDN {string}  Object of interest, e.g. 'uid=bob,ou=People,dc=example,dc=com'
 * @filter {string}  Optional LDAP query to limit results, like '(objectClass=posixAccount)'
 * @returns {promise}  
 */
async function getObjectDetail(baseDN, filter) {
  let connection = await connect(ldapServerURLs, config.bind.readOnlyDN, config.bind.readOnlyPassword).catch((err) => {
    console.error('LDAP server error:', err)
    reject(err)
  })

  let opts = {
    attributes: allowedAttributes,
    filter: filter,
    scope: 'base'
  }

  let results = []
  return new Promise((resolve, reject) => {
    connection.search(baseDN, opts, (err, res) => {
      res.on('searchEntry', (entry) => {
        console.debug('dn:', entry.objectName)

        // Any LDAP attribute that is not a property of the collectedAttributes below will be ignored.
        // Also determines if attributes are treated as single-value (string) or multi-value (array).
        let collectedAttributes = {
          "dn": entry.objectName,
          "objectClass": [],
          "cn": [],
          "description": '',
          "displayName": '',
          "gidNumber": '',
          "givenName": '',
          "homeDirectory": '',
          "initials": '',
          "mail": '',
          "memberUid": [],
          "sn": '',
          "uid": '',
          "uidNumber": ''
        }

        entry.attributes.forEach(attribute => {
          if (typeof collectedAttributes[attribute.type] === 'string') {
            console.debug('  single-value attribute:', attribute.type)
            collectedAttributes[attribute.type] = attribute._vals[0].toString()
            console.debug('    value:', collectedAttributes[attribute.type])
          }
          else if (typeof collectedAttributes[attribute.type] === 'object' && collectedAttributes[attribute.type].constructor == Array) {
            console.debug('  multi-value attribute:', attribute.type)
            attribute._vals.forEach(value => {
              console.debug('    value:', value.toString())
              collectedAttributes[attribute.type].push(value.toString())
            })
          }
          else {
            console.debug('  uncaptured attribute:', attribute.type)
          }
        })
        results.push(collectedAttributes)
      })

      res.on('error', (err) => {
        reject(err.message)
      })

      res.on('end', () => {
        connection.unbind(() => {
          resolve(results)
        })
      })
    })
  })
}


/**
 * Update object with a new attribute value. Will create the attribute if not present. 
 * @param {string} dn  Distinguish name of object e.g. uid=user,ou=People,dc=example,dc=com
 * @param {string} attribute  Name of attribute e.g. givenName
 * @param {string} value  New value for the attribute e.g. Bob
 */
async function modifyAttribute(dn, attribute, value) {
  let mod = {
    [attribute]: value || null
  }

  const change = new ldapjs.Change({
    operation: 'replace',
    modification: mod
  })

  let connection = await connect(ldapServerURLs, config.bind.readWriteDN, config.bind.readWritePassword).catch((err) => {
    console.error('LDAP server error:', err)
    reject(err)
  })

  return new Promise((resolve, reject) => {
    console.debug('Modifying:', dn)
    connection.modify(dn, change, (err) => {
      if (err) {
        connection.unbind(() => {
          reject(err.lde_message)
        })
      }
      else {
        connection.unbind(() => {
          resolve(dn)
        })
      }
    })
  })
}


/**
 * Change the password for the given dn with the ldappasswd shell command
 * @param {string} dn  Distinguished name for the user
 * @param {string} password  New password
 * @returns {promise}  resolves to dn of the user, rejects with error message
 */
async function modifyPassword(dn, password) {
  let command = `ldappasswd -H "${ldapServerURLs}" -x -D "${config.bind.readWriteDN}" -w "${config.bind.readWritePassword}" -s "${password}" "${dn}"`

  return new Promise((resolve, reject) => {
    console.debug('Changing password for:', dn)
    console.debug('Running:', command)
    exec(command, (error, stdout, stderr) => {
      if (error) {
        console.error(stdout + stderr)
        reject(stdout + stderr)
      }
      else {
        resolve(dn)
      }
    })
  })
}


/*
 *  API
 *
 *  Static files (HTML, images, client-side JavaScript, and CSS) are served from /client
 *  API calls are made to / with the distinguished name appended. e.g. /uid=bob,ou=People,dc=home
 * 
 *  GET
 *    replies with all allowed attributes for the requested object. (See allowedAttributes above.)
 *  GET with a query parameter of ?view=subordinate
 *    replies with a list of dn and classes for subordiante objects. (Used to list contents of OUs.)
 *  PUT
 *    updates the single, JSON-formatted attribute in the request body.
 */
const app = express()

app.use(express.json())
app.use(authCheck)
app.use('/', express.static(__dirname + '/client'))


/*
 * @oas [get] /config/structure
 * description: "Return hints about how the LDAP directory is laid out"
 * responses:
 *   "200":
 *     description: "DNs to help the web client understand the directory layout"
 */
app.get('/config/structure', function (req, res) {
  res.send(config.structure)
})


/*
 * @oas [get] /{dn}
 * description: "Return attributes of an LDAP distinguished name"
 * parameters:
 *   - (path) dn {String} The LDAP distinguished name
 *   - (query) view {string} If subordinate, treat dn as a container and return its subordinate objects
 * responses:
 *   "200":
 *     description: "Attributes of the requested DN"
 */
app.get('/:dn', async function (req, res) {
  let results = ''

  console.debug(req.query);
  if (req.query.view == 'subordinate') {
    results = await getSubordinateObjects(req.params.dn)
  }
  else {
    results = await getObjectDetail(req.params.dn)
  }

  res.send(results)
})


/*
 * @oas [put] /{dn}
 * description: "Set attributes of the LDAP distinguished name"
 * parameters:
 *   - (path) dn {String} The LDAP distinguished name
 * responses:
 *   "200":
 *     description: "Replies with the DN in the body."
 *   "403":
 *     description: "Changing the attribute is not allowed by configuration"
 *   "500":
 *     description: "Password change failed for reason stated in response body"
 */
app.put('/:dn', async function (req, res) {
  let requestedAttribute = Object.keys(req.body)[0]
  console.debug('attribute:', Object.keys(req.body))

  if (requestedAttribute == 'userPassword') {
    if (config.api.allowUserPasswordChange == 'yes') {
      let result = await modifyPassword(req.params.dn, req.body.userPassword).catch((err) => {
        res.status(500)
        res.send(err)
      })
      res.send(result)
    }
    else {
      console.debug("Configuration setting [api] allowUserPasswordChange forbids password changes")
      res.status(403)
      res.send('Password change not allowed')
    }
  }
  else {
    console.debug('Checking access for:', requestedAttribute)
    if (!allowedAttributes.includes(requestedAttribute)) {
      res.status(403)
      res.send('attribute not allowed')
    }
    else {
      let value = req.body[requestedAttribute]
      console.debug(`Setting ${requestedAttribute} on ${req.params.dn} to:`, value)
      res.send(await modifyAttribute(req.params.dn, requestedAttribute, value))
    }
  }
})


/*
 * Listen on port 3268 and TLS port 3269, unless configured otherwise in config.ini
 */
console.log('Starting API')

createServer(app).listen(config.api.port || 3268)

if (config.api.useTLS !== 'no') {
  try {
    let tlsCert = readFileSync(join(__dirname, 'config', 'server.crt'))
    let tlsKey = readFileSync(join(__dirname + 'config', 'server.key'))
    createServerTLS({ cert: tlsCert, key: tlsKey }, app).listen(config.api.tlsPort || 3269)
  }
  catch (ex) {
    console.warn('TLS certificate error.', ex)
  }
}
