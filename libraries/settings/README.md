# @superpaper/settings

A small module to allow global config settings to be set for all services
within the superPaper architecture.

## Settings file location

You can specify a custom location for the settings file by setting the
`SUPERPAPER_CONFIG` environment variable. E.g.

    $ export SUPERPAPER_CONFIG=/home/james/config/settings.development.js

Otherwise, the settings will be loaded from `config/settings.NODE_ENV.js`,
where `NODE_ENV` is another environment variable, or defaults to `development`.

The config directory is first looked for in the current directory, and then relative
to the settings module directory.
