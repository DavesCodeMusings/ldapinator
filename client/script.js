const api = `${window.location.protocol}//${window.location.host}`

/*
 * baseDN, groupDN, userDN
 * Filled by getDirectoryStructure() function below.
 */
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
 * E.g. "ou=People,dc=example,dc=com" becomes just "People"
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
 * @param {string} dn  LDAP context in which to start. Eg. dc=example,dc=com 
 * @param {string} element Parent element for the dynamically generated HTML 
 */
async function showSubordinates(dn, element) {
    document.getElementById('details-dn').value = dn
    console.debug(`Contacting LDAP API ${api}/${dn}`)
    let response = await fetch(`${api}/${dn}?view=subordinate`)
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
                htmlFragment += `<summary onclick="showSubordinates('${ldapObject.dn}', '${ldapObject.dn}'); showFields('${ldapObject.dn}', 'organizationalUnit')">`
                htmlFragment += '<img alt="[folder]" src="icons/folder.svg">'
                htmlFragment += `${shortName(ldapObject.dn)}</summary>`
                htmlFragment += `</summary>`
                htmlFragment += `<p id="${ldapObject.dn}"></p>`
                htmlFragment += `</details>`
            }
            else if (ldapObject.classes.includes('posixAccount')) {
                htmlFragment += `<p  id="${ldapObject.dn}" onclick="showAttributes('${ldapObject.dn}'); showFields('${ldapObject.dn}', 'posixAccount')">`
                htmlFragment += '<img alt="[posix-account]" src="icons/account.svg">'
                htmlFragment += `${shortName(ldapObject.dn)}</p>`
                htmlFragment += '</p>'
            }
            else if (ldapObject.classes.includes('posixGroup')) {
                htmlFragment += `<p id="${ldapObject.dn}" onclick="showAttributes('${ldapObject.dn}'); showFields('${ldapObject.dn}', 'posixGroup')">`
                htmlFragment += '<img alt="[posix-group]" src="icons/account-multiple.svg">'
                htmlFragment += `${shortName(ldapObject.dn)}</p>`
                htmlFragment += '</p>'
            }
            else if (ldapObject.classes.includes('organizationalRole') || ldapObject.classes.includes('inetOrgPerson')) {
                htmlFragment += `<p id="${ldapObject.dn}" onclick="showDN('${ldapObject.dn}'); showFields('${ldapObject.dn}', 'organizationalRole');">`
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
 * Fill details form with attributes for a particular LDAP object.
 * @param {string} dn Object to get attributes for. Eg. uid=dave,ou=People,dc=example,dc=com
 */
async function showAttributes(dn) {
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
        document.getElementById('details-memberUid').value = jsonObject[0].memberUid.toString()
    }
}

function showFields(dn, className) {
    console.debug('showFields(%s, %s)', dn, className)
    let userFieldsDisplay = ''
    let groupFieldsDisplay = ''

    switch (className) {
        case 'posixGroup':
            document.getElementById('details-icon').src = 'icons/account-multiple.svg'
            userFieldsDisplay = 'none'
            groupFieldsDisplay = 'block'
        break

        case 'posixAccount':
            document.getElementById('details-icon').src = 'icons/account.svg'
            userFieldsDisplay = 'block'
            groupFieldsDisplay = 'none'
        break

        case 'organizationalRole':
            document.getElementById('details-icon').src = 'icons/account-outline.svg'
            userFieldsDisplay = 'none'
            groupFieldsDisplay = 'none'
        break
    
        case 'dcObject':
        case 'organization':
            document.getElementById('details-icon').src = 'icons/site-map-outline.svg'
            userFieldsDisplay = 'none'
            groupFieldsDisplay = 'none'
        break

        case 'organizationalUnit':
            document.getElementById('details-icon').src = 'icons/folder.svg'
            userFieldsDisplay = 'none'
            groupFieldsDisplay = 'none'
        break

        default:
            document.getElementById('details-icon').src = 'icons/food-drumstick.svg'
            userFieldsDisplay = 'none'
            groupFieldsDisplay = 'none'
        break
    }

    let userFields = document.getElementsByClassName('posixAccount')
    let groupFields = document.getElementsByClassName('posixGroup')
    for (i=0; i<userFields.length; i++) {
        userFields[i].style.display = userFieldsDisplay
    }
    for (i=0; i<groupFields.length; i++) {
        groupFields[i].style.display = groupFieldsDisplay
    }

    /* Show new user or new group button when the focus is on an OU of users or groups */
    let newPosixAccountFields = document.getElementsByClassName('new-posixAccount')
    let newPosixGroupFields = document.getElementsByClassName('new-posixGroup')

    switch (dn) {
        case directoryStructure.groupDN:
            for (i=0; i<newPosixAccountFields.length; i++) {
                newPosixAccountFields[i].style.display = 'none'
            }
            for (i=0; i<newPosixGroupFields.length; i++) {
                newPosixGroupFields[i].style.display = 'block'
            }        
            break
        case directoryStructure.userDN:
            for (i=0; i<newPosixGroupFields.length; i++) {
                newPosixGroupFields[i].style.display = 'none'
            }
            for (i=0; i<newPosixAccountFields.length; i++) {
                newPosixAccountFields[i].style.display = 'block'
            }
            break
        default:
            for (i=0; i<newPosixAccountFields.length; i++) {
                newPosixAccountFields[i].style.display = 'none'
            }
            for (i=0; i<newPosixGroupFields.length; i++) {
                newPosixGroupFields[i].style.display = 'none'
            }
            break
    }
}

function passwordDialog(state) {
    let passwordDialogFields = document.getElementsByClassName('password-dialog')
    let passwordChangeButton = document.getElementById('password-dialog-btn')
    let passwordField = document.getElementById('password')
    let passwordConfirmField = document.getElementById('password-confirm')

    switch (state) {
        case 'show':
            console.debug("Opening password dialog")
            passwordChangeButton.style.display = 'none'
            for (i=0; i<passwordDialogFields.length; i++) {
                passwordDialogFields[i].style.display = 'inline'
            }
        break

        case 'hide':
            console.debug("Closing password dialog")
            passwordField.value=''
            passwordConfirmField.value=''
            passwordChangeButton.style.display = 'block'
            for (i=0; i<passwordDialogFields.length; i++) {
                passwordDialogFields[i].style.display = 'none'
            }
        break

        case 'change':
            if (passwordField.value != passwordConfirmField.value) {
                alert('Passwords do not match')
            }
            else if (passwordField.value.length < 8) {
                alert('Password is too short')
            }
            else {
                alert('Password change is not implemented in the API yet.')
            }
        break
    }
}
