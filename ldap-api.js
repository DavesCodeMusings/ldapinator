#!/usr/bin/env node

import { URL } from 'url'
import { readFileSync } from 'fs'
import ini from 'ini'
import ldapjs from 'ldapjs'
import express from 'express'

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
const configFile = 'config.ini'
var config = {}
var ldapServerURLs = [];
var apiAuthorization = '';

try {
  config = ini.parse(readFileSync(new URL(configFile, import.meta.url).pathname, 'utf-8'))
  console.debug(`Settings from ${configFile}:`, config)
}
catch (ex) {
  console.error(`Unable to parse ${configFile}.`)
  console.debug(ex)
}

if (config.connect.primary) {
  ldapServerURLs.push(config.connect.primary)
}
else {
  ldapServerURLs.push('ldap://127.0.0.1:389')
}
if (config.connect.secondary) {
  ldapServerURLs.push(config.connect.secondary)
}

apiAuthorization = 'Basic ' + Buffer.from(`${config.api.readWriteUser}:${config.api.readWritePassword}`).toString('base64')  


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
  'uidNumber',
  'userPassword'
]


/**
 * Express middleware function to enforce authorization for any non-GET requests. 
 * @param {object} req  HTTP request object
 * @param {object} res  HTTP response object
 * @param {function} next  Next middleware function to pass control to
 */
function authCheck(req, res, next) {
  if (req.method !== 'GET' && req.headers.authorization !== apiAuthorization) {
    res.status(401)
    res.send('Please log in to make changes.')
    console.error('Bad API credentials')
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
async function getObjects(baseDN) {
  let connection = await connect(ldapServerURLs, config.bind.readOnlyDN, config.bind.readOnlyPassword).catch((err) => {
    console.error('LDAP server error:', err)
    reject(err)
  })

  let opts = {
    scope: 'one'
  }

  let results = []
  return new Promise((resolve, reject) => {
    connection.search(baseDN, opts, (err, res) => {
      res.on('searchEntry', (entry) => {
        console.debug('dn:', entry.objectName)
        let classAttributes = entry.attributes.filter(attribute => attribute.type == 'objectClass')
        let objectClasses = []
        classAttributes.forEach(attribute => {
          console.debug('  attribute type:', attribute.type)
          if (attribute.type == 'objectClass') {
            attribute._vals.forEach(value => {
              console.debug('    value:', value.toString())
              objectClasses.push(value.toString())
            })
          }
        })
        let returnAttributes = {
          "dn": entry.objectName,
          "classes": objectClasses
        }
        results.push(returnAttributes)
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

        let returnAttributes = {
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
          "uidNumber": '',
          "userPassword": ''
        }

        entry.attributes.forEach(attribute => {
          console.debug('  attribute type:', attribute.type)
          if (attribute.type == 'cn') {
            attribute._vals.forEach(value => {
              console.debug('    value:', value.toString())
              returnAttributes.cn.push(value.toString())
            })
          }
          if (attribute.type == 'description') {
            returnAttributes.description = attribute._vals[0].toString()
            console.debug('    value:', returnAttributes.description)
          }
          if (attribute.type == 'displayName') {
            returnAttributes.displayName = attribute._vals[0].toString()
            console.debug('    value:', returnAttributes.displayName)
          }
          if (attribute.type == 'gidNumber') {
            returnAttributes.gidNumber = attribute._vals[0].toString()
            console.debug('    value:', returnAttributes.gidNumber)
          }
          if (attribute.type == 'givenName') {
            returnAttributes.givenName = attribute._vals[0].toString()
            console.debug('    value:', returnAttributes.givenName)
          }
          if (attribute.type == 'homeDirectory') {
            returnAttributes.homeDirectory = attribute._vals[0].toString()
            console.debug('    value:', returnAttributes.homeDirectory)
          }
          if (attribute.type == 'initials') {
            returnAttributes.initials = attribute._vals[0].toString()
            console.debug('    value:', returnAttributes.initials)
          }
          if (attribute.type == 'mail') {
            returnAttributes.mail = attribute._vals[0].toString()
            console.debug('    value:', returnAttributes.mail)
          }
          if (attribute.type == 'memberUid') {
            attribute._vals.forEach(value => {
              console.debug('    value:', value.toString())
              returnAttributes.memberUid.push(value.toString())
            })
          }
          if (attribute.type == 'objectClass') {
            attribute._vals.forEach(value => {
              console.debug('    value:', value.toString())
              returnAttributes.objectClass.push(value.toString())
            })
          }
          if (attribute.type == 'sn') {
            returnAttributes.sn = attribute._vals[0].toString()
            console.debug('    value:', returnAttributes.sn)
          }
          if (attribute.type == 'uid') {
            returnAttributes.uid = attribute._vals[0].toString()
            console.debug('    value:', returnAttributes.uid)
          }
          if (attribute.type == 'uidNumber') {
            returnAttributes.uidNumber = attribute._vals[0].toString()
            console.debug('    value:', returnAttributes.uidNumber)
          }
          if (attribute.type == 'userPassword') {
            returnAttributes.userPassword = attribute._vals[0].toString()
            console.debug('    value:', returnAttributes.userPassword)
          }
        })

        results.push(returnAttributes)
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


/*
 *  Static files (HTML, images, client-side JavaScript, and CSS) are served from /client
 *  API calls are made to / with the distinguished name appended. e.g. /uid=bob,ou=People,dc=home
 * 
 *  GET
 *    replies with all allowed attributes for the requested object. (See allowedAttributes above.)
 *  GET with a query parameter of ?view=subordinate
 *    replies with a list of dn and classes for subordiante objects. (Used to list contents of OUs.)
 *  POST
 *    creates or updates the single, JSON-formatted attribute in the request body.
 */
const app = express()

app.use(express.json())
app.use(authCheck)
app.use('/', express.static(__dirname + '/client'))

app.get('/config/baseDN', function (req, res) {
  res.send(config.connect.baseDN)
})

app.get('/:dn', async function (req, res) {
  let results = ''

  console.debug(req.query);
  if (req.query.view == 'subordinate') {
    results = await getObjects(req.params.dn)
  }
  else {
    results = await getObjectDetail(req.params.dn)
  }

  res.send(results)
})

app.post('/:dn', async function (req, res) {
  let requestedAttribute = Object.keys(req.body)[0]

  console.debug(req.body)
  console.debug('Body:', Object.keys(req.body))
  console.debug('Checking access for:', requestedAttribute)

  if (!allowedAttributes.includes(requestedAttribute)) {
    res.status(400)
    res.send('attribute not allowed')
  }
  else {
    let value = req.body[requestedAttribute]
    console.debug(`Setting new description attribute on ${req.params.dn}:`, value)
    res.send(await modifyAttribute(req.params.dn, requestedAttribute, value))
  }
})

app.listen(3269)
