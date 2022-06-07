const api = `${window.location.protocol}//${window.location.host}`
var apiToken = ''
var directoryStructure


/**
 * API call to get hints about the LDAP directory layout from config.ini [structure] section.
 * @param {function} callback 
 */
async function getDirectoryStructure(callback) {
  let response = await fetch(`${api}/config/structure`)
  if (response.status != 200) {
      alert('Error contacting API')
  }
  else {
      directoryStructure = JSON.parse(await response.text())
      callback()
  }
}


/**
 * Create a shortened version of a distinguished name using the top-most component.
 * E.g. "dc=example,dc=com" becomes "example.com" and "ou=People,dc=example,dc=com"
 * becomes just "People"
 * @param {string} dn 
 * @returns {string}
 */
function shortName(dn) {
    if (dn.startsWith('dc=')) {
        // for domains, replace dc= or ,dc= with . and then remove the first dot (.)
        return dn.replace(/,?dc=/, '.').substring(1)
    }
    else {
        return dn.substring(dn.indexOf('=') + 1, dn.indexOf(','))
    }
}


/**
 * Show the LDAP directory objects in tree format.
 * @param {string} dn  LDAP context in which to start. Eg. dc=example,dc=com 
 * @param {string} element Parent element for the dynamically generated HTML 
 */
async function showSubordinates(dn, element) {
    document.getElementById('details-shortName').value = shortName(dn)
    document.getElementById('details-dn').value = dn
    console.debug(`Contacting LDAP API ${api}/${dn}`)
    let response = await fetch(`${api}/${dn}?view=subordinate`)
    if (response.status != 200) {
        console.error(response)
        alert('API call failed.')
    }
    else {
        let text = await response.text()
        let jsonObject = JSON.parse(text)
        console.debug('API reply:', jsonObject)
        let target = document.getElementById(element)
        target.innerHTML = ''
        jsonObject.forEach(ldapObject => {
            let htmlFragment = ''
            console.debug(ldapObject.classes)
            if (ldapObject.classes.includes('organizationalUnit')) {
                htmlFragment += `
                  <details>
                    <summary onclick="showSubordinates('${ldapObject.dn}', '${ldapObject.dn}'); showFields('${ldapObject.dn}', 'organizationalUnit')">
                      <img alt="[folder]" src="icons/folder.svg"> ${shortName(ldapObject.dn)}
                    </summary>
                    <p id="${ldapObject.dn}"></p>
                  </details>`
            }
            else if (ldapObject.classes.includes('posixAccount')) {
                htmlFragment += `
                  <p  id="${ldapObject.dn}" onclick="showAttributes('${ldapObject.dn}'); showFields('${ldapObject.dn}', 'posixAccount')">
                    <img alt="[posix-account]" src="icons/account.svg"> ${shortName(ldapObject.dn)}
                  </p>`
            }
            else if (ldapObject.classes.includes('posixGroup')) {
                htmlFragment += `
                  <p id="${ldapObject.dn}" onclick="showAttributes('${ldapObject.dn}'); showFields('${ldapObject.dn}', 'posixGroup')">
                    <img alt="[posix-group]" src="icons/account-multiple.svg"> ${shortName(ldapObject.dn)}
                  </p>`
            }
            else if (ldapObject.classes.includes('organizationalRole') || ldapObject.classes.includes('inetOrgPerson')) {
                htmlFragment += `
                  <p id="${ldapObject.dn}" onclick="showAttributes('${ldapObject.dn}'); showFields('${ldapObject.dn}', 'organizationalRole');">
                    <img alt="[organizational-role]" src="icons/account-outline.svg"> ${shortName(ldapObject.dn)}
                  </p>`
            }
            else {
                console.debug('dn:', ldapObject.dn)
                htmlFragment += `
                  <p id="${ldapObject.dn}">
                    <img alt="[unknown]" src="icons/${icon}"> ${shortName(ldapObject.dn)}
                  </p>`
            }

            target.innerHTML += `${htmlFragment}\n`
        })
    }
}


/**
 * Fill details form with attributes for a particular LDAP object.
 * @param {string} dn Object to get attributes for. Eg. uid=dave,ou=People,dc=example,dc=com
 */
async function showAttributes(dn) {
    let api = `${window.location.protocol}//${window.location.host}`
    console.debug(`<p>Contacting LDAP API ${api}/${dn}</p>`)
    let response = await fetch(`${api}/${dn}`)
    if (response.status != 200) {
        console.error(response)
        alert('API call failed.')
    }
    else {
        let text = await response.text()
        let jsonObject = JSON.parse(text)
        document.getElementById('details-shortName').value = shortName(jsonObject[0].dn)
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
        document.getElementById('details-memberUid').value = jsonObject[0].memberUid.toString()
    }
}


function showFields(dn, className) {
    console.debug('showFields(%s, %s)', dn, className)

    formElements = document.getElementById('attributes').children
    for (let i = 0; i < formElements.length; i++) {
      if (formElements[i].classList.contains(className) || formElements[i].classList.contains('all')) {
        formElements[i].style.display = 'inline';
      }
      else {
        formElements[i].style.display = 'none';
      }
    }

    switch (className) {
        case 'posixGroup':
            document.getElementById('details-icon').src = 'icons/account-multiple.svg'
        break

        case 'posixAccount':
            document.getElementById('details-icon').src = 'icons/account.svg'
        break

        case 'organizationalRole':
            document.getElementById('details-icon').src = 'icons/account-outline.svg'
        break
    
        case 'dcObject':
        case 'organization':
            document.getElementById('details-icon').src = 'icons/site-map-outline.svg'
        break

        case 'organizationalUnit':
            document.getElementById('details-icon').src = 'icons/folder.svg'
        break

        default:
            document.getElementById('details-icon').src = 'icons/food-drumstick.svg'
        break
    }
}


async function modifyAttribute(attribute) {
    let dn = document.getElementById('details-dn').value
    let value = document.getElementById('details-' + attribute).value

    console.debug(`Modifying ${attribute} to "${value}" for ${dn}`)
    headers = new Headers()
    headers.append('Content-Type', 'application/json')
    headers.append('Authorization', 'Bearer ' + apiToken)
    const options = {
        method: 'PUT',
        headers: headers,
        body: `{ "${attribute}": "${value}" }`
    }

    let response = await fetch(`${api}/${dn}`, options)
    if (response.status != 200) {
        console.error('Modify failed')
        alert('API call failed.\nData shown on screen is no longer consistent with database!')
    }
    else {
        console.debug('Modify complete')
    }


    let body = {}
    body[attribute] = value
    console.debug('request body:', body)
}


function togglePasswordDialog(state) {
    document.getElementById('change-password-icon').style.display = (state == 'show' ? 'none' : 'inline') 
    formElements = document.getElementById('attributes').children
    for (let i = 0; i < formElements.length; i++) {
      if (formElements[i].classList.contains('passwordDialog')) {
        formElements[i].style.display = (state == 'show' ? 'inline' : 'none')
      }
    }
}


function clearPasswordFields() {
    document.getElementById('password').value = ''
    document.getElementById('password-confirm').value = ''
    togglePasswordDialog('hide')
}


async function changePassword() {
    let userDN = document.getElementById('details-dn').value
    let password = document.getElementById('password').value
    let passwordConfirm = document.getElementById('password-confirm').value

    console.debug("Password change requested for:", userDN)

    if (password != passwordConfirm) {
        alert('Passwords do not match')
    }
    else if (password.length == 0) {
        alert('Password cannot be empty')
    }
    else {
        headers = new Headers()
        headers.append('Content-Type', 'application/json')
        headers.append('Authorization', 'Bearer ' + apiToken)
        const options = {
            method: 'PUT',
            headers: headers,
            body: `{ "userPassword": "${password}" }`
        }

        let response = await fetch(`${api}/${userDN}`, options)
        if (response.status != 200) {
            console.debug('Unable to change password.')
            alert('API call failed.\nPassword was not updated.')
        }
        else {
            alert('Password changed.')
        }
    }
}


function getApiToken() {
    apiToken = document.getElementById('api-token').value
    document.getElementById('api-token').value = ''
    document.getElementById('api-login').style.display = 'none'
    document.getElementById('api-logout').style.display = 'inline'
    document.getElementById('api-auth-dialog').close()
}


function clearApiToken() {
    apiToken = ''
    document.getElementById('api-token').value = ''
    document.getElementById('api-logout').style.display = 'none'
    document.getElementById('api-login').style.display = 'inline'
}
