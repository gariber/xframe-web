import { render } from 'preact'
import { App } from './App'
import { listenForShares } from './launch'
import '../src/ui/theme.css'
import './style.css'

render(<App subscribe={(load) => { void listenForShares(load) }} />, document.getElementById('app')!)
