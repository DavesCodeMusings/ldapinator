const api = `${window.location.protocol}//${window.location.host}`
var baseDN

async function getBaseDN(callback) {
  let response = await fetch(`${api}/config/baseDN`)
  if (response.status != 200) {
      alert('Error contacting API')
  }
  else {
      baseDN = await response.text()
      callback()
  }
}

/**
 * Create a shortened version of a distinguished name using the top-most component.
 * Eg. "ou=People,dc=example,dc=com" becomes just "People"
 * @param {string} dn 
 * @returns {string}
 */
function shortName(dn) {
    return dn.substring(dn.indexOf('=') + 1, dn.indexOf(','))
}

function showDN(dn) {
    document.getElementById('details-dn').value = dn
}

/**
 * Show the LDAP directory objects in tree format.
 * @param {string} baseDN  LDAP context in which to start. Eg. dc=example,dc=com 
 * @param {string} element Parent element for the dynamically generated HTML 
 */
async function showEntries(baseDN, element) {
    document.getElementById('details-dn').value = baseDN
    console.debug(`<p>Contacting LDAP API ${api}/${baseDN}</p>`)
    let response = await fetch(`${api}/${baseDN}?view=subordinate`)
    if (response.status != 200) {
        console.error(response)
    }
    else {
        let text = await response.text()
        let jsonObject = JSON.parse(text)
        console.debug(jsonObject)
        let target = document.getElementById(element)
        target.innerHTML = ''
        jsonObject.forEach(ldapObject => {
            let htmlFragment = ''
            console.debug(ldapObject.classes)
            if (ldapObject.classes.includes('organizationalUnit')) {
                htmlFragment += '<details>'
                htmlFragment += `<summary onclick="showEntries('${ldapObject.dn}', '${ldapObject.dn}'); showFields('none')">`
                htmlFragment += '<img alt="[folder]" src="icons/folder.svg">'
                htmlFragment += `${shortName(ldapObject.dn)}</summary>`
                htmlFragment += `</summary>`
                htmlFragment += `<p id="${ldapObject.dn}"></p>`
                htmlFragment += `</details>`
            }
            else if (ldapObject.classes.includes('posixAccount')) {
                htmlFragment += `<p  id="${ldapObject.dn}" onclick="showDetails('${ldapObject.dn}'); showFields('user')">`
                htmlFragment += '<img alt="[posix-account]" src="icons/account.svg">'
                htmlFragment += `${shortName(ldapObject.dn)}</p>`
                htmlFragment += '</p>'
            }
            else if (ldapObject.classes.includes('posixGroup')) {
                htmlFragment += `<p id="${ldapObject.dn}" onclick="showDetails('${ldapObject.dn}'); showFields('group')">`
                htmlFragment += '<img alt="[posix-group]" src="icons/account-multiple.svg">'
                htmlFragment += `${shortName(ldapObject.dn)}</p>`
                htmlFragment += '</p>'
            }
            else if (ldapObject.classes.includes('organizationalRole') || ldapObject.classes.includes('inetOrgPerson')) {
                htmlFragment += `<p id="${ldapObject.dn}" onclick="showDN('${ldapObject.dn}'); showFields('none');">`
                htmlFragment += '<img alt="[organizational-role]" src="icons/account-outline.svg">'
                htmlFragment += `${shortName(ldapObject.dn)}</p>`
                htmlFragment += '</p>'
            }
            else {
                console.debug('dn:', ldapObject.dn)
                let icon = 'food-drumstick.svg'
                htmlFragment += `<p id="${ldapObject.dn}">`
                htmlFragment += `<img alt="[unknown]" src="icons/${icon}">`
                htmlFragment += `${shortName(ldapObject.dn)}</p>`
                htmlFragment += '</p>'
            }
            target.innerHTML += `${htmlFragment}\n`
        })
    }
}

/**
 * Get attributes for a particular LDAP object.
 * @param {string} dn Object to get attributes for. Eg. uid=dave,ou=People,dc=example,dc=com
 */
async function showDetails(dn) {
    let api = `${window.location.protocol}//${window.location.host}`
    console.debug(`<p>Contacting LDAP API ${api}/${dn}</p>`)
    let response = await fetch(`${api}/${dn}`)
    if (response.status != 200) {
        console.error(response)
    }
    else {
        let text = await response.text()
        let jsonObject = JSON.parse(text)
        document.getElementById('details-dn').value = jsonObject[0].dn
        document.getElementById('details-description').value = jsonObject[0].description
        document.getElementById('details-displayName').value = jsonObject[0].displayName
        document.getElementById('details-givenName').value = jsonObject[0].givenName
        document.getElementById('details-initials').value = jsonObject[0].initials
        document.getElementById('details-sn').value = jsonObject[0].sn
        document.getElementById('details-mail').value = jsonObject[0].mail
        document.getElementById('details-uid').value = jsonObject[0].uid
        document.getElementById('details-uidNumber').value = jsonObject[0].uidNumber
        document.getElementById('details-gidNumber').value = jsonObject[0].gidNumber
        document.getElementById('details-homeDirectory').value = jsonObject[0].homeDirectory
        document.getElementById('details-userPassword').value = jsonObject[0].userPassword
        document.getElementById('details-memberUid').value = jsonObject[0].memberUid.toString()
    }
}

function showFields(className) {
    let userFields = document.getElementsByClassName('user')
    let groupFields = document.getElementsByClassName('group')

    switch (className) {
        case 'group':
            for (i=0; i<userFields.length; i++) {
                userFields[i].style.display = 'none'
            }
            for (i=0; i<groupFields.length; i++) {
                groupFields[i].style.display = 'block'
            }        
            break
        case 'user':
            for (i=0; i<groupFields.length; i++) {
                groupFields[i].style.display = 'none'
            }
            for (i=0; i<userFields.length; i++) {
                userFields[i].style.display = 'block'
            }
            break
        case 'none':
            for (i=0; i<userFields.length; i++) {
                userFields[i].style.display = 'none'
            }
            for (i=0; i<groupFields.length; i++) {
                groupFields[i].style.display = 'none'
            }
            break
    }
}
