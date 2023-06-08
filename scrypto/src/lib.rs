use scrypto::prelude::*;

#[blueprint]
mod oracle {
    struct Oracle {
        /// Last price of each resource pair
        prices: KeyValueStore<(ResourceAddress, ResourceAddress), Decimal>,
        /// The admin badge resource def address
        admin_badge: ResourceAddress,
    }

    impl Oracle {
        /// Creates a Oracle component, along with admin badges.
        pub fn instantiate_oracle(num_of_admins: u32) -> (Bucket, ComponentAddress) {
            assert!(num_of_admins >= 1, "Must have at least one admin");

            let admin_badges = ResourceBuilder::new_fungible()
                .divisibility(DIVISIBILITY_NONE)
                .metadata("name", "Oracle Admin Badge")
                .mint_initial_supply(num_of_admins);

            let rules = AccessRulesConfig::new()
                .method(
                    "update_price",
                    rule!(require(admin_badges.resource_address())),
                    AccessRule::DenyAll,
                )
                .default(rule!(allow_all), AccessRule::DenyAll);

            let component = Self {
                prices: KeyValueStore::new(),
                admin_badge: admin_badges.resource_address(),
            }
            .instantiate();
            let component_address = component.globalize_with_access_rules(rules);

            (admin_badges, component_address)
        }

        /// Returns the current price of a resource pair BASE/QUOTE.
        pub fn get_price(&self, base: ResourceAddress, quote: ResourceAddress) -> Option<Decimal> {
            match self.prices.get(&(base, quote)) {
                Some(price) => Some(*price),
                None => None,
            }
        }

        /// Updates the price of a resource pair BASE/QUOTE and its inverse.
        pub fn update_price(&self, base: ResourceAddress, quote: ResourceAddress, price: Decimal) {
            self.prices.insert((base, quote), price);
            self.prices.insert((quote, base), dec!("1") / price);
        }
    }
}
