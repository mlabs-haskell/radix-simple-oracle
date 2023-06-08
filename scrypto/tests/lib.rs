use crate::test_lib::TestLib;
use radix_engine::transaction::TransactionReceipt;
use scrypto::prelude::*;
use transaction::{builder::ManifestBuilder, model::TransactionManifest};

mod test_lib;

struct OracleTest {
    lib: TestLib,
    admin_badge: ResourceAddress,
    oracle_component: ComponentAddress,
    account_component: ComponentAddress,
    public_key: EcdsaSecp256k1PublicKey,
    resources: HashMap<String, ResourceAddress>,
}

impl OracleTest {
    pub fn new(num_admins: u32) -> Self {
        let mut lib = TestLib::new();

        let (public_key, _private_key, account_component) = lib.test_runner.new_allocated_account();

        let package_address = lib.test_runner.compile_and_publish(this_package!());

        let manifest = ManifestBuilder::new()
            .call_function(
                package_address,
                "Oracle",
                "instantiate_oracle",
                manifest_args!(num_admins),
            )
            .call_method(
                account_component,
                "deposit_batch",
                manifest_args!(ManifestExpression::EntireWorktop),
            )
            .build();
        let receipt = lib.test_runner.execute_manifest_ignoring_fee(
            manifest,
            vec![NonFungibleGlobalId::from_public_key(&public_key)],
        );
        println!("instantiate_oracle receipt: {:?}", receipt);
        let result = receipt.expect_commit_success();
        let oracle_component = result.new_component_addresses()[0];
        let new_resources = result.new_resource_addresses();
        let mut resources = HashMap::new();
        for addr in new_resources {
            let name = lib
                .expect_string_metadata(addr, "name")
                .expect("Name metadata key should be present");
            resources.insert(name, addr.clone());
        }
        let admin_badge = resources.get("Oracle Admin Badge").unwrap().clone();

        Self {
            resources,
            oracle_component,
            account_component,
            admin_badge,
            lib,
            public_key,
        }
    }

    fn execute_get_price(
        &mut self,
        base: ResourceAddress,
        quote: ResourceAddress,
    ) -> TransactionReceipt {
        let manifest = ManifestBuilder::new()
            .call_method(
                self.oracle_component,
                "get_price",
                manifest_args!(base, quote),
            )
            .build();
        let receipt = self.execute_manifest(manifest);
        println!("get_price receipt: {:?}", receipt);
        receipt
    }

    fn execute_update_price(
        &mut self,
        base: ResourceAddress,
        quote: ResourceAddress,
        price: Decimal,
    ) -> TransactionReceipt {
        let manifest = ManifestBuilder::new()
            .call_method(
                self.account_component,
                "create_proof_by_amount",
                manifest_args!(self.admin_badge, dec!("1")),
            )
            .call_method(
                self.oracle_component,
                "update_price",
                manifest_args!(base, quote, price),
            )
            .build();
        let receipt = self.execute_manifest(manifest);
        println!("update_price receipt: {:?}", receipt);
        receipt
    }

    fn execute_manifest(&mut self, manifest: TransactionManifest) -> TransactionReceipt {
        self.lib.test_runner.execute_manifest_ignoring_fee(
            manifest,
            vec![NonFungibleGlobalId::from_public_key(&self.public_key)],
        )
    }
}

#[test]
fn test_oracle() {
    let mut test = OracleTest::new(1);

    let expected_resource_names: Vec<String> = vec!["Oracle Admin Badge".to_string()];
    assert!(
        expected_resource_names
            .iter()
            .all(|res| { test.resources.get(res).is_some() }),
        "Unexpected new resources, expected resources: {:?}\nbut got {:?}",
        expected_resource_names,
        test.resources
    );

    assert_eq!(
        test.lib
            .test_runner
            .account_balance(test.account_component, test.admin_badge.clone()),
        Some(dec!("1")),
    );

    let resource1 = test.lib
        .test_runner
        .create_fungible_resource(dec!("1"), DIVISIBILITY_NONE, test.account_component);
    let resource2 = test.lib
        .test_runner
        .create_non_fungible_resource(test.account_component);

    let receipt = test.execute_get_price(resource1, resource2);
    let price: Option<Decimal> = receipt.expect_commit_success().output(1);
    assert_eq!(price, None);

    let new_price = dec!("1.5");
    let receipt = test.execute_update_price(resource1, resource2, new_price);
    receipt.expect_commit_success();

    let receipt = test.execute_get_price(resource1, resource2);
    let price: Option<Decimal> = receipt.expect_commit_success().output(1);
    assert_eq!(price, Some(new_price));

    let receipt = test.execute_get_price(resource2, resource1);
    let price: Option<Decimal> = receipt.expect_commit_success().output(1);
    assert_eq!(price, Some(dec!("1") / new_price));
}

#[test]
fn test_invalid_num_admins() {
    let mut lib = TestLib::new();

    let (public_key, _private_key, account_component) = lib.test_runner.new_allocated_account();

    let package_address = lib.test_runner.compile_and_publish(this_package!());

    let manifest = ManifestBuilder::new()
        .call_function(
            package_address,
            "Oracle",
            "instantiate_oracle",
            manifest_args!(0u32),
        )
        .call_method(
            account_component,
            "deposit_batch",
            manifest_args!(ManifestExpression::EntireWorktop),
        )
        .build();
    let receipt = lib.test_runner.execute_manifest_ignoring_fee(
        manifest,
        vec![NonFungibleGlobalId::from_public_key(&public_key)],
    );
    println!("instantiate_oracle receipt: {:?}", receipt);
    TestLib::expect_error_log(&receipt, "Must have at least one admin")
}
