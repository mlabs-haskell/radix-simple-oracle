import {
    Alert,
    AppBar,
    Button,
    Card,
    CardContent,
    CssBaseline,
    FormControl,
    FormHelperText,
    FormLabel,
    MenuItem,
    Select,
    TextField,
    Toolbar,
    Typography,
} from '@mui/material'
import {
    Address,
    Decimal,
    Expression,
    ManifestBuilder,
    U32,
} from '@radixdlt/radix-dapp-toolkit'
import { useState, useEffect } from 'react'
import {
    FungibleResourcesCollectionItem as NonFungibleResourcesCollectionItem,
    GatewayApiClient,
    StateEntityDetailsResponseItem,
} from '@radixdlt/babylon-gateway-api-sdk'
import {
    useAccounts,
    useConnected,
    useSendTransaction,
    usePersona,
} from './hooks/radix'

declare global {
    namespace JSX {
        interface IntrinsicElements {
            'radix-connect-button': React.DetailedHTMLProps<
                React.HTMLAttributes<HTMLElement>,
                HTMLElement
            >
        }
    }
}

type DataJsonField =
    | { kind: 'String'; value: string }
    | { kind: 'U64'; value: string }
    | { kind: 'I64'; value: string }
    | { kind: 'Tuple'; fields: DataJsonField[] }
    | { kind: 'Enum'; fields: DataJsonField[]; variant_id: number }
    | { kind: 'Address'; value: string }
    | { kind: 'Own'; value: string }
    | { kind: 'Decimal'; value: string }

type NonFungibleResource = NonFungibleResourcesCollectionItem & {
    vaults: {
        items: {
            vault_address: string
            total_count: string
        }[]
    }
}

type Account = {
    address: string
    label: string
    appearanceId: number
}

function App() {
    const packageAddr =
        'package_tdx_c_1qrw4sgjw670278sj8rpz9ptgk96vgg679866qa3lqq9s002qvf'
    const gatewayApi = GatewayApiClient.initialize({
        basePath: 'https://rcnet.radixdlt.com',
    })
    const { transaction, state } = gatewayApi

    const accounts: Account[] = useAccounts()
    const persona = usePersona()
    const connected = useConnected()
    const sendTransaction = useSendTransaction()

    const [componentAddr, setComponentAddr] = useState<string | undefined>()
    const [adminBadge, setAdminBadge] = useState<string | undefined>()
    const oracleInstantiated = [componentAddr, adminBadge].every(
        (v) => typeof v === 'string' && v.length > 0
    )

    const [accountId, setAccountId] = useState<number | undefined>()
    const [adminAccount, setAdminAccount] = useState<Account | undefined>()
    useEffect(() => {
        if (accounts.length > 0) {
            setAccountId((v) =>
                typeof v !== 'undefined' ? v : accounts[0].appearanceId
            )
        }
    }, [accounts])
    const account = accounts.find((v) => v.appearanceId === accountId)!

    const [baseResourceAddr, setBaseResourceAddr] = useState<
        string | undefined
    >('resource_tdx_c_1qyqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq40v2wv')
    const [quoteResourceAddr, setQuoteResourceAddr] = useState<
        string | undefined
    >(adminBadge)
    const [newPrice, setNewPrice] = useState(1)

    useEffect(() => {
        if (adminBadge && !quoteResourceAddr) {
            setQuoteResourceAddr(adminBadge)
        }
    }, [adminBadge])

    const [currentPrice, setCurrentPrice] = useState<number | null>(null)
    const [priceMessage, setPriceMessage] = useState('')

    let instantiateManifest: string
    let getPriceManifest: string
    let updatePriceManifest: string
    if (connected && account) {
        instantiateManifest = new ManifestBuilder()
            .callFunction(packageAddr, 'Oracle', 'instantiate_oracle', [U32(1)])
            .callMethod(account.address, 'deposit_batch', [
                Expression('ENTIRE_WORKTOP'),
            ])
            .build()
            .toString()
        if (
            componentAddr &&
            adminBadge &&
            adminAccount &&
            quoteResourceAddr &&
            baseResourceAddr
        ) {
            getPriceManifest = new ManifestBuilder()
                .callMethod(componentAddr, 'get_price', [
                    Address(baseResourceAddr),
                    Address(quoteResourceAddr),
                ])
                .build()
                .toString()
            updatePriceManifest = new ManifestBuilder()
                .callMethod(adminAccount.address, 'create_proof_by_amount', [
                    Address(adminBadge),
                    Decimal(1),
                ])
                .callMethod(componentAddr, 'update_price', [
                    Address(baseResourceAddr),
                    Address(quoteResourceAddr),
                    Decimal(newPrice),
                ])
                .build()
                .toString()
        }
    }

    async function instantiateOracle() {
        const result = await sendTransaction(instantiateManifest)
        console.log('Transaction result: ', result)
        if (result.isErr()) throw result.error
        const tx = result.value.transactionIntentHash
            // '97b96019f0fde8cfd158c353a22bdd639741f0d61e89322aebdc499dad1edc1c'
        const status = await transaction.getStatus(tx)
        console.log('Instantiate TransactionApi transaction/status:', status)

        const commitReceipt = await transaction.getCommittedDetails(tx)
        console.log('Instantiate Committed Details Receipt', commitReceipt)

        console.log(
            'Component address:',
            commitReceipt.details.referenced_global_entities[0]
        )
        const entities = await state.getEntityDetailsVaultAggregated(
            commitReceipt.details.referenced_global_entities
        )
        console.log('Entity details:', entities)
        setComponentAddr(
            entities.find((v) => v.details?.type === 'Component')?.address
        )
        const metadataNameIs =
            (name: string) => (v: StateEntityDetailsResponseItem) =>
                v.metadata.items.find((m) => m.key === 'name')?.value
                    .as_string === name
        console.log(
            entities.find(metadataNameIs(`Oracle Admin Badge`))?.address
        )

        setAdminBadge(
            entities.find(metadataNameIs(`Oracle Admin Badge`))?.address
        )
        setAdminAccount(account)
    }

    async function getPrice() {
        const result = await sendTransaction(getPriceManifest)
        console.log('Transaction result: ', result)
        if (result.isErr()) throw result.error
        const tx = result.value.transactionIntentHash
        const status = await transaction.getStatus(tx)
        console.log('Get Price TransactionApi transaction/status:', status)

        const commitReceipt = await transaction.getCommittedDetails(tx)
        console.log('Get Price Committed Details Receipt', commitReceipt)
        type TxDetails = {
            receipt: {
                output: { data_json: DataJsonField }[]
            }
        }
        const details = commitReceipt.details as TxDetails
        const output = details.receipt.output
        if (output.length !== 2 || output[1].data_json.kind !== 'Enum') {
            throw new Error('Unexpected return type from get_price method')
        }
        const data = output[1].data_json
        if (data.variant_id === 0) {
            setCurrentPrice(null)
            setPriceMessage('No price available for the given addresses')
        } else if (
            data.variant_id === 1 &&
            data.fields.length === 1 &&
            data.fields[0].kind === 'Decimal'
        ) {
            setCurrentPrice(Number(data.fields[0].value))
            setPriceMessage('')
        } else {
            throw new Error('Unexpected return type from get_price method')
        }
    }

    async function updatePrice() {
        const result = await sendTransaction(updatePriceManifest)
        console.log('Transaction result: ', result)
        if (result.isErr()) throw result.error
        const tx = result.value.transactionIntentHash
        const status = await transaction.getStatus(tx)
        console.log('Update Price TransactionApi transaction/status:', status)
        if (status.status === 'CommittedSuccess') {
            setCurrentPrice(newPrice)
            setPriceMessage('')
        } else {
            alert('Something went wrong updating the price :(')
        }
    }

    const accountSelectForm = typeof accountId !== 'undefined' && (
        <FormControl>
            <FormLabel id='account-select-input'>Select an account</FormLabel>
            <Select
                aria-labelledby='account-select-input'
                value={accountId}
                onChange={async (event) => {
                    setAccountId(
                        Number((event.target as HTMLInputElement).value)
                    )
                }}
            >
                {accounts.map((a) => (
                    <MenuItem key={a.appearanceId} value={a.appearanceId}>
                        {a.label} ({a.address})
                    </MenuItem>
                ))}
            </Select>
            <FormHelperText>
                All actions will use this account. Use the Connect button in the
                top right to add more accounts.
            </FormHelperText>
        </FormControl>
    )

    // TODO: validation of addresses before they're used in transactions
    const priceForm = (
        <FormControl sx={{ minWidth: '40em' }}>
            <div className='my-3 w-full'>
                <FormLabel id='base-resource-input' sx={{ display: 'block' }}>
                    Select the base resource (defaults to RDX)
                </FormLabel>
                <TextField
                    fullWidth={true}
                    aria-labelledby='base-resource-input'
                    required
                    error={!baseResourceAddr}
                    value={baseResourceAddr || ''}
                    onChange={(event) => {
                        setBaseResourceAddr(
                            (event.target as HTMLInputElement).value
                        )
                    }}
                />
            </div>
            <div className='my-3 w-full'>
                <FormLabel id='quote-resource-input' sx={{ display: 'block' }}>
                    Select the quote resource (defaults to the admin token for
                    this oracle)
                </FormLabel>
                <TextField
                    fullWidth={true}
                    aria-labelledby='quote-resource-input'
                    required
                    error={!quoteResourceAddr}
                    value={quoteResourceAddr || ''}
                    onChange={(event) => {
                        setQuoteResourceAddr(
                            (event.target as HTMLInputElement).value
                        )
                    }}
                />
            </div>
            <div className='my-3'>
                <FormLabel id='new-price-input' sx={{ display: 'block' }}>
                    Set a new price
                </FormLabel>
                <TextField
                    aria-labelledby='new-price-input'
                    type='number'
                    value={newPrice}
                    onChange={(event) => {
                        const val = Number(
                            (event.target as HTMLInputElement).value
                        )
                        if (val >= 0) setNewPrice(val)
                    }}
                />
                <FormHelperText sx={{ mx: 0 }}>
                    (Has no effect when getting the current price)
                </FormHelperText>
            </div>
            <div className='my-3 flex'>
                <Button
                    disabled={!baseResourceAddr || !quoteResourceAddr}
                    variant='outlined'
                    onClick={getPrice}
                    sx={{ mr: '1em' }}
                >
                    Get current price
                </Button>
                <Button
                    variant='contained'
                    onClick={updatePrice}
                    disabled={!baseResourceAddr || !quoteResourceAddr}
                >
                    Update price as admin
                </Button>
            </div>
        </FormControl>
    )

    const userDataDisplay = (
        <Card className='w-fit' sx={{minWidth: 275}}>
            <CardContent className='flex justify-around'>
                <div>
                    <Typography
                        sx={{ fontSize: 14 }}
                        color='text.secondary'
                        gutterBottom
                    >
                        Persona
                    </Typography>
                    <Typography variant='h5' component='div'>
                        {persona?.label}
                    </Typography>
                </div>

                {persona.data?.map((v) => (
                    <div key={v.field}>
                        <Typography
                            sx={{ fontSize: 14 }}
                            color='text.secondary'
                            gutterBottom
                        >
                            {v.field}
                        </Typography>
                        <Typography variant='h5' component='div'>
                            {v.value}
                        </Typography>
                    </div>
                ))}
            </CardContent>
        </Card>
    )

    const walletConnectedDisplay = (
        <>
            <h2 className='text-2xl font-medium mb-5'>User Data</h2>
            {userDataDisplay}
            <h2 className='text-2xl font-medium my-5'>Oracle</h2>
            <div className='my-5'>{accountSelectForm}</div>
            {oracleInstantiated ? (
                <>
                    <Alert severity='info' className='my-5'>
                        Oracle instantiated: {componentAddr}
                        <br />
                        Admin badge: {adminBadge}
                    </Alert>
                    {priceForm}
                    {currentPrice !== null ? (
                        <Card sx={{ minWidth: 275 }}>
                            <CardContent>
                                <Typography
                                    sx={{ fontSize: 14 }}
                                    color='text.secondary'
                                    gutterBottom
                                >
                                    {baseResourceAddr} &#8594;
                                    <br />
                                    {quoteResourceAddr}
                                </Typography>
                                <Typography variant='h5' component='div'>
                                    {currentPrice}
                                </Typography>
                            </CardContent>
                        </Card>
                    ) : (
                        priceMessage && (
                            <Alert severity='warning'>{priceMessage}</Alert>
                        )
                    )}
                </>
            ) : (
                <Button variant='contained' onClick={instantiateOracle}>
                    Instantiate new oracle component
                </Button>
            )}
        </>
    )

    return (
        <CssBaseline>
            <AppBar className='mb-5 w-screen' position='sticky'>
                <Toolbar
                    className='w-full max-w-4xl mx-auto'
                    sx={{ p: { sm: 0 } }}
                >
                    <h1 className='text-3xl font-medium grow'>
                        Radix Simple Oracle
                    </h1>
                    <radix-connect-button />
                </Toolbar>
            </AppBar>
            <div className='max-w-4xl mx-auto mb-96'>
                <p className='mb-10'>
                    If you haven't already,{' '}
                    <a
                        href='https://docs-babylon.radixdlt.com/main/getting-started-developers/wallet/wallet-and-connecter-installation.html'
                        className='text-blue-500'
                    >
                        install the wallet and browser extension
                    </a>{' '}
                    to use this app, then click the connect button in the top
                    right. Note that you may have to open and close the wallet
                    app sometimes if transactions aren't showing up.
                </p>
                {connected ? walletConnectedDisplay : null}
            </div>
        </CssBaseline>
    )
}

export default App
