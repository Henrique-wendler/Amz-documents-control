from amazon_agro.repositories.fake_properties import FakePropertyRepository


def test_fake_property_repository_searches_demo_records() -> None:
    repository = FakePropertyRepository()
    assert [item.external_id for item in repository.search("porto")] == ["DEMO-002"]
    assert repository.get_by_external_id("missing") is None
