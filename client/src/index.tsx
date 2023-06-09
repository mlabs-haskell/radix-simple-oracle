import * as React from 'react'
import * as ReactDOM from 'react-dom/client'
import './index.css'
import App from './App'
import { RdtProvider } from './RdtProvider'
import { RadixDappToolkit } from '@radixdlt/radix-dapp-toolkit'
import { ThemeProvider, createTheme } from '@mui/material'

const dAppId =
    'account_tdx_c_1py4629lunfet62va5lsrwrs46ktzmucuw34jqwhte6mqqcc8wd'

const rdt = RadixDappToolkit(
    { dAppDefinitionAddress: dAppId, dAppName: 'Simple Oracle' },
    (requestData) => {
        requestData({
            accounts: { quantifier: 'atLeast', quantity: 1 },
            personaData: { fields: ['givenName'] },
        }).map(({ data: { accounts } }) => {
            // add accounts to dApp application state
            console.log('account data: ', accounts)
        })
    },
    {
        networkId: 12, // 12 is for RCnet 01 for Mainnet
        onDisconnect: () => {
            console.log('Disconnected!')

            // clear your application state
        },
        onInit: ({ accounts }) => {
            // set your initial application state
            console.log('onInit accounts: ', accounts)
            if (accounts && accounts.length > 0) {
                console.log('Found account')
            }
        },
    }
)

const root = ReactDOM.createRoot(document.getElementById('root') as HTMLElement)
root.render(
    <React.StrictMode>
        <ThemeProvider theme={createTheme({
            palette: {
                primary: {
                    main: '#fe0343'
                }
            }
        })}>
            <RdtProvider value={rdt}>
                <App />
            </RdtProvider>
        </ThemeProvider>
    </React.StrictMode>
)
