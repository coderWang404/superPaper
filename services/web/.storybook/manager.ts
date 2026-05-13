import { addons } from 'storybook/manager-api'
import { create } from 'storybook/theming/create'

import './manager.css'

import brandImage from '../public/img/ol-brand/superpaper.svg'

const theme = create({
  base: 'light',
  brandTitle: 'SuperPaper',
  brandUrl: 'https://www.superpaper.com',
  brandImage,
})

addons.setConfig({ theme })
