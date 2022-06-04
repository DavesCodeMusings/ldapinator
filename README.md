# ldapinator
_A totally small-time LDAP administration tool for your home network_

## What is it?
ldapinator is a web-based administration tool for small LDAP installations. Think OpenLDAP running on a Linux machine in your basement. It's not for big enterprisey stuff.

## How do I run it?
The easiest way is using Docker Compose. But first, you need to create a config.ini file.

### config.ini
```
[connect]
host = ldap://192.168.0.100:389

[bind]
readOnlyDN = "uid=search,dc=example,dc=com"
readOnlyPassword = redacted
readWriteDN = "cn=Manager,dc=example,dc=com"
readWritePassword = redacted

[structure]
baseDN = "dc=example,dc=com"

[api]
;port = 3269  ; uncomment to override default
allowAnonymousRead = yes       ; yes or no
allowAnonymousModify = yes     ; yes or no
allowUserPasswordChange = yes  ; yes or no
authorizedUser = update
authorizedPassword = redacted
```

Obviously, adjust config.ini to match your installation.

### compose.yml
```
services:
  ldapinator:
    image: davescodemusings/ldapinator:latest
    container_name: ldapinator
    hostname: ldapinator
    restart: unless-stopped
    ports:
      - "3269:3269"
    volumes:
      - ./config.ini:/app/config.ini
```

Now, do `docker-compose up -d` and point your web browser to http://your.host:3269

## What does it look like?
A monochrome color scheme in keeping with the minimalist approach of Ldapinator, featuring Material Design icons.

![User Dialog](https://github.com/DavesCodeMusings/ldapinator/blob/main/docs/images/LDAPinator_User_Dialog.jpg)

_Screenshot of the User Dialog_


![Group Dialog](https://github.com/DavesCodeMusings/ldapinator/blob/main/docs/images/LDAPinator_Group_Dialog.jpg)

_Screenshot of the Group Dialog_

## For the love of God, man... why???
Just about any application that supports centralized user authentication can use LDAP for that purpose. For me, the list looks like this:
* Dovecot
* Gitea
* Jellyfin
* Nextcloud
* Portainer
* TheLounge

All of these apps can authenticate users via a centralized LDAP directory. Now, instead of six different passwords to manage in six different apps, there is only one.

> _There can be only one -- The Highlander_

As nifty as LDAP can be for the home network user, it's not easy to find tools to maintain the LDAP database. It's either command-line (tedious!) or an over-blown Java thing like Apache Directory Studio (learning curve!). LDAPAdmin is nice for Windows OS, but it's getting old and it's written in Pascal (good luck!)

Ldapinator aims to fill the niche for the LDAP enamored home network admin. 

## Caveats
The ldapinator is still in development. So far it can read your LDAP objects, but not change them. Changes do work using back-end REST API calls, but there's no pretty web front-end for it yet. It's an Express.js app, so if you're handy with that sort of thing, I'm sure you can figure it out.

Nothing's encrypted. If you're concerned, use Nginx as a reverse proxy to handle TLS connections.

## Continued Development
Ldapinator is a work in progress. Currently, it has these features:

* You can update attributes for users and change their passwords.
* You can edit group descriptions and GIDs, but not membership.
* You can configure TLS certificates for encrypted communications.
* You can configure to prevent updates without authorization, but currently there is no login via the web.
* You can use the REST API to do everything (and more) that you can do via the web page.

It's going to be a while before I add a feature to add and remove users or groups. You'll have to use other tools for that. I am a lone developer, not an enterprise team. Refer to Highlander quote above.

It's Express.js under the covers though, so it should be fairly accessible if you want to hack on it and add features.

## Docker Hub
https://hub.docker.com/r/davescodemusings/ldapinator
